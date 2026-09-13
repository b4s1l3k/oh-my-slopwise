import { expect, test } from "@playwright/test"
import {
  apiJson,
  authenticatedContext,
  createExpense,
  createGroup,
  login,
  userId,
  users,
} from "./helpers"

test.describe("membership transaction rollback", () => {
  test("keeps membership, balances and history intact when removal is blocked by debt", async ({
    page,
  }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, {
      name: "Member removal rollback E2E",
      memberIds: [bobId],
    })
    await createExpense(page, groupId, {
      title: "Blocking debt",
      amount: 1_000,
      currency: "RUB",
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }, { userId: bobId }],
    })
    const before = await membershipState(page, groupId)

    const response = await page.request.delete(`/api/v1/groups/${groupId}/members?userId=${bobId}`)

    expect(response.status(), await response.text()).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ error: { code: "MEMBER_HAS_BALANCE" } })
    expect(await membershipState(page, groupId)).toEqual(before)
  })

  test("does not duplicate removal history when an inactive member is removed again", async ({ page }) => {
    await login(page, users.alice)
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, {
      name: "Repeated member removal E2E",
      memberIds: [bobId],
    })
    await apiJson(page, `/api/v1/groups/${groupId}/members?userId=${bobId}`, { method: "DELETE" })
    const before = await membershipState(page, groupId)

    const response = await page.request.delete(`/api/v1/groups/${groupId}/members?userId=${bobId}`)

    expect(response.status(), await response.text()).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND" } })
    expect(await membershipState(page, groupId)).toEqual(before)
  })

  test("failed removal by a regular member does not partially deactivate another member", async ({
    browser,
  }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const bobId = await userId(alicePage, "Боб")
    const carolId = await userId(alicePage, "Карина")
    const groupId = await createGroup(alicePage, {
      name: "Unauthorized member removal rollback E2E",
      memberIds: [bobId, carolId],
    })
    const before = await membershipState(alicePage, groupId)
    const bobContext = await authenticatedContext(browser, users.bob)
    const bobPage = bobContext.pages()[0]

    const response = await bobPage.request.delete(
      `/api/v1/groups/${groupId}/members?userId=${carolId}`
    )

    expect(response.status(), await response.text()).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } })
    expect(await membershipState(alicePage, groupId)).toEqual(before)

    await bobContext.close()
    await aliceContext.close()
  })
})

async function membershipState(page: Parameters<typeof apiJson>[0], groupId: string) {
  const [group, balances, expenses, settlements, activity, statistics] = await Promise.all([
    apiJson(page, `/api/v1/groups/${groupId}`),
    apiJson(page, `/api/v1/groups/${groupId}/balances`),
    apiJson(page, `/api/v1/groups/${groupId}/expenses`),
    apiJson(page, `/api/v1/groups/${groupId}/settlements`),
    apiJson(page, `/api/v1/groups/${groupId}/activity`),
    apiJson(page, "/api/v1/users/me/statistics"),
  ])
  return { group, balances, expenses, settlements, activity, statistics }
}
