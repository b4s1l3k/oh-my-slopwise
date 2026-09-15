import { expect, test } from "@playwright/test"
import {
  apiJson,
  authenticatedContext,
  createGroup,
  login,
  userId,
  users,
} from "./helpers"

type ActivityDto = {
  id: string
  groupId: string | null
  actorId: string
  type: string
  entityType: string
  entityId: string
  metadata: Record<string, unknown>
  createdAt: string
  actor: { id: string; name: string }
}

test.describe("activity API", () => {
  test("records every mutable group operation with an actor and useful metadata", async ({ browser }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const aliceId = (await apiJson<{ user: { id: string } }>(alicePage, "/api/v1/users/me")).user.id
    const bobId = await userId(alicePage, "Боб")
    const carolId = await userId(alicePage, "Карина")
    const groupId = await createGroup(alicePage, {
      name: "Every activity E2E",
      memberIds: [bobId],
    })
    await apiJson(alicePage, `/api/v1/groups/${groupId}`, {
      method: "PATCH",
      body: { name: "Every activity renamed E2E" },
    })
    await apiJson(alicePage, `/api/v1/groups/${groupId}/members`, {
      method: "POST",
      expectedStatus: 201,
      body: { userId: carolId },
    })
    const { expense } = await apiJson<{ expense: { id: string } }>(
      alicePage,
      `/api/v1/groups/${groupId}/expenses`,
      {
        method: "POST",
        expectedStatus: 201,
        body: {
          title: "Activity operations expense",
          amount: 2_000,
          currency: "RUB",
          date: "2026-09-13",
          paidById: aliceId,
          splitType: "EQUAL",
          splits: [{ userId: aliceId }, { userId: bobId }],
        },
      }
    )
    await apiJson(alicePage, `/api/v1/expenses/${expense.id}`, {
      method: "PATCH",
      body: {
        title: "Activity operations updated",
        amount: 2_000,
        currency: "RUB",
        date: "2026-09-14",
        paidById: aliceId,
        splitType: "EQUAL",
        splits: [{ userId: aliceId }, { userId: bobId }],
      },
    })

    const bobContext = await authenticatedContext(browser, users.bob)
    const bobPage = bobContext.pages()[0]
    await apiJson(bobPage, "/api/v1/settlements", {
      method: "POST",
      expectedStatus: 201,
      body: {
        groupId,
        toUserId: aliceId,
        amount: 1_000,
        currency: "RUB",
        date: "2026-09-15",
      },
    })
    await apiJson(alicePage, `/api/v1/groups/${groupId}/settlements`, { method: "DELETE" })
    await apiJson(alicePage, `/api/v1/expenses/${expense.id}`, { method: "DELETE" })
    await apiJson(alicePage, `/api/v1/groups/${groupId}/members?userId=${carolId}`, {
      method: "DELETE",
    })

    const { activities } = await apiJson<{ activities: ActivityDto[] }>(
      alicePage,
      `/api/v1/groups/${groupId}/activity`
    )
    expect(new Set(activities.map((activity) => activity.type))).toEqual(
      new Set([
        "GROUP_UPDATED",
        "MEMBER_ADDED",
        "EXPENSE_CREATED",
        "EXPENSE_UPDATED",
        "SETTLEMENT_CREATED",
        "SETTLEMENTS_RESET",
        "EXPENSE_DELETED",
        "MEMBER_REMOVED",
      ])
    )
    expect(activities.every((activity) => activity.groupId === groupId)).toBe(true)
    expect(activities.every((activity) => activity.actor.id === activity.actorId)).toBe(true)
    expect(activities.find((activity) => activity.type === "EXPENSE_CREATED")?.metadata)
      .toMatchObject({ title: "Activity operations expense", amount: 2_000, currency: "RUB" })
    expect(activities.find((activity) => activity.type === "SETTLEMENTS_RESET")?.metadata)
      .toMatchObject({ removed: 1 })
    expect(activities.find((activity) => activity.type === "MEMBER_REMOVED")?.metadata)
      .toMatchObject({ memberName: users.carol.name, selfLeft: false })

    await bobContext.close()
    await aliceContext.close()
  })

  test("returns no more than the newest fifty activity records", async ({ page }) => {
    await login(page, users.alice)
    const groupId = await createGroup(page, { name: "Activity limit E2E" })
    for (let index = 0; index < 55; index += 1) {
      await apiJson(page, `/api/v1/groups/${groupId}`, {
        method: "PATCH",
        body: { name: `Activity limit E2E ${index}` },
      })
    }

    const { activities } = await apiJson<{ activities: ActivityDto[] }>(
      page,
      `/api/v1/groups/${groupId}/activity`
    )
    expect(activities).toHaveLength(50)
    expect(activities.every((activity) => activity.type === "GROUP_UPDATED")).toBe(true)
    expect(activities.every((activity) => Number.isFinite(Date.parse(activity.createdAt)))).toBe(true)
  })

  test("does not expose a group activity feed to an outsider", async ({ browser }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const groupId = await createGroup(alicePage, { name: "Private activity E2E" })
    const outsiderContext = await authenticatedContext(browser, users.outsider)
    const outsiderPage = outsiderContext.pages()[0]

    const response = await outsiderPage.request.get(`/api/v1/groups/${groupId}/activity`)
    expect(response.status()).toBe(403)
    expect(await response.json()).toEqual({ error: "Forbidden" })

    await outsiderContext.close()
    await aliceContext.close()
  })
})
