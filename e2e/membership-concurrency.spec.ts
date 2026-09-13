import { expect, test } from "@playwright/test"
import {
  apiJson,
  createGroup,
  login,
  userId,
  users,
} from "./helpers"

type GroupMemberDto = {
  userId: string
  isActive: boolean
}

async function groupMembers(page: import("@playwright/test").Page, groupId: string) {
  return (await apiJson<{ group: { members: GroupMemberDto[] } }>(
    page,
    `/api/v1/groups/${groupId}`
  )).group.members
}

test.describe("concurrent membership operations", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, users.alice)
  })

  test("adds the same member once under concurrent requests", async ({ page }) => {
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, { name: "Concurrent member add E2E" })
    const command = { userId: bobId }

    const responses = await Promise.all([
      page.request.post(`/api/v1/groups/${groupId}/members`, { data: command }),
      page.request.post(`/api/v1/groups/${groupId}/members`, { data: command }),
    ])

    expect(responses.map((response) => response.status()).sort()).toEqual([201, 409])
    const conflict = responses.find((response) => response.status() === 409)
    await expect(conflict?.json()).resolves.toMatchObject({
      error: { code: "MEMBER_ALREADY_ACTIVE" },
    })
    expect((await groupMembers(page, groupId)).filter(({ userId }) => userId === bobId)).toHaveLength(1)

    const activity = await apiJson<{
      activities: Array<{ type: string; entityId: string }>
    }>(page, `/api/v1/groups/${groupId}/activity`)
    expect(
      activity.activities.filter(
        ({ type, entityId }) => type === "MEMBER_ADDED" && entityId === bobId
      )
    ).toHaveLength(1)
  })

  test("removes the same member once under concurrent requests", async ({ page }) => {
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, {
      name: "Concurrent member removal E2E",
      memberIds: [bobId],
    })
    const path = `/api/v1/groups/${groupId}/members?userId=${bobId}`

    const responses = await Promise.all([
      page.request.delete(path),
      page.request.delete(path),
    ])

    expect(responses.map((response) => response.status()).sort()).toEqual([200, 404])
    expect((await groupMembers(page, groupId)).some(({ userId }) => userId === bobId)).toBe(false)
    const activity = await apiJson<{
      activities: Array<{ type: string; entityId: string }>
    }>(page, `/api/v1/groups/${groupId}/activity`)
    expect(
      activity.activities.filter(
        ({ type, entityId }) => type === "MEMBER_REMOVED" && entityId === bobId
      )
    ).toHaveLength(1)
  })

  test("never leaves an inactive member with a balance when expense creation races removal", async ({
    page,
  }) => {
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, {
      name: "Member expense race E2E",
      memberIds: [bobId],
    })
    const expenseCommand = {
      title: "Concurrent membership debt",
      amount: 2_000,
      currency: "RUB",
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }, { userId: bobId }],
    }

    const [removeResponse, expenseResponse] = await Promise.all([
      page.request.delete(`/api/v1/groups/${groupId}/members?userId=${bobId}`),
      page.request.post(`/api/v1/groups/${groupId}/expenses`, { data: expenseCommand }),
    ])

    const members = await groupMembers(page, groupId)
    const expenses = await apiJson<{ expenses: Array<{ title: string }> }>(
      page,
      `/api/v1/groups/${groupId}/expenses`
    )
    const balances = await apiJson<{
      balances: { simplified: Array<{ fromUserId: string; amount: number }> }
    }>(page, `/api/v1/groups/${groupId}/balances`)

    if (expenseResponse.status() === 201) {
      expect(removeResponse.status()).toBe(409)
      expect(members.some(({ userId }) => userId === bobId)).toBe(true)
      expect(expenses.expenses).toMatchObject([{ title: "Concurrent membership debt" }])
      expect(balances.balances.simplified).toMatchObject([{ fromUserId: bobId, amount: 1_000 }])
    } else {
      expect(expenseResponse.status()).toBe(422)
      await expect(expenseResponse.json()).resolves.toMatchObject({
        error: { code: "SPLIT_USER_NOT_MEMBER" },
      })
      expect(removeResponse.status()).toBe(200)
      expect(members.some(({ userId }) => userId === bobId)).toBe(false)
      expect(expenses.expenses).toEqual([])
      expect(balances.balances.simplified).toEqual([])
    }
  })
})
