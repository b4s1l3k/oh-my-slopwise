import { expect, test } from "@playwright/test"
import { apiJson, createExpense, createGroup, login, userId, users } from "./helpers"

test.describe("group transaction rollback", () => {
  test("failed deletion preserves the complete aggregate and lifetime facts", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, {
      name: "Group deletion rollback E2E",
      memberIds: [bobId],
    })
    await createExpense(page, groupId, {
      title: "Debt preserving the group",
      amount: 2_000,
      currency: "RUB",
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }, { userId: bobId }],
    })
    const before = await groupState(page, groupId)

    const response = await page.request.delete(`/api/v1/groups/${groupId}`)

    expect(response.status(), await response.text()).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ error: { code: "GROUP_HAS_BALANCES" } })
    expect(await groupState(page, groupId)).toEqual(before)
  })

  test("unknown member during creation leaves no group or lifetime-statistics residue", async ({ page }) => {
    await login(page, users.alice)
    const bobId = await userId(page, "Боб")
    const before = await accountState(page)

    const response = await page.request.post("/api/v1/groups", {
      data: {
        name: "Must not partially exist",
        type: "TRIP",
        currency: "RUB",
        memberIds: [bobId, "missing-user-id"],
      },
    })

    expect(response.status(), await response.text()).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ error: { code: "USER_NOT_FOUND" } })
    expect(await accountState(page)).toEqual(before)
  })
})

async function groupState(page: Parameters<typeof apiJson>[0], groupId: string) {
  const [group, expenses, balances, settlements, activity, account] = await Promise.all([
    apiJson(page, `/api/v1/groups/${groupId}`),
    apiJson(page, `/api/v1/groups/${groupId}/expenses`),
    apiJson(page, `/api/v1/groups/${groupId}/balances`),
    apiJson(page, `/api/v1/groups/${groupId}/settlements`),
    apiJson(page, `/api/v1/groups/${groupId}/activity`),
    accountState(page),
  ])
  return { group, expenses, balances, settlements, activity, account }
}

async function accountState(page: Parameters<typeof apiJson>[0]) {
  const [groups, statistics] = await Promise.all([
    apiJson(page, "/api/v1/groups"),
    apiJson(page, "/api/v1/users/me/statistics"),
  ])
  return { groups, statistics }
}
