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

type BalanceOverview = {
  totals: Array<{ currency: string; owed: number; owe: number }>
  friendBalances: Array<{
    userId: string
    userName: string
    balance: number
    currency: string
    groups: string[]
  }>
}

type GroupBalances = {
  balances: {
    raw: Array<{ userId: string; userName: string; balance: number }>
    simplified: Array<{
      fromUserId: string
      toUserId: string
      amount: number
    }>
  }
}

function friendBalance(overview: BalanceOverview, userId: string, currency: string): number {
  return overview.friendBalances.find(
    (balance) => balance.userId === userId && balance.currency === currency
  )?.balance ?? 0
}

test.describe("balance calculations and overview", () => {
  test("simplifies a three-person balance without losing the raw totals", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const carolId = await userId(page, "Карина")
    const groupId = await createGroup(page, {
      name: "Three-way balance E2E",
      memberIds: [bobId, carolId],
    })
    await createExpense(page, groupId, {
      title: "Alice paid",
      amount: 3_000,
      currency: "RUB",
      date: "2026-09-11",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }, { userId: bobId }, { userId: carolId }],
    })
    await createExpense(page, groupId, {
      title: "Bob paid",
      amount: 1_500,
      currency: "RUB",
      date: "2026-09-12",
      paidById: bobId,
      splitType: "EXACT",
      splits: [
        { userId: aliceId, amount: 500 },
        { userId: bobId, amount: 500 },
        { userId: carolId, amount: 500 },
      ],
    })

    const result = await apiJson<GroupBalances>(page, `/api/v1/groups/${groupId}/balances`)
    expect(Object.fromEntries(result.balances.raw.map((row) => [row.userId, row.balance])))
      .toEqual({ [aliceId]: 1_500, [bobId]: 0, [carolId]: -1_500 })
    expect(result.balances.simplified).toEqual([
      expect.objectContaining({ fromUserId: carolId, toUserId: aliceId, amount: 1_500 }),
    ])
  })

  test("keeps overview totals separated by each group settlement currency", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const before = await apiJson<BalanceOverview>(page, "/api/v1/balances/overview")
    const rubName = "Overview RUB E2E"
    const usdName = "Overview USD E2E"
    const rubGroupId = await createGroup(page, { name: rubName, memberIds: [bobId] })
    const usdGroupId = await createGroup(page, {
      name: usdName,
      memberIds: [bobId],
      currency: "USD",
    })

    await createExpense(page, rubGroupId, {
      title: "RUB overview debt",
      amount: 4_000,
      currency: "RUB",
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }, { userId: bobId }],
    })
    await createExpense(page, usdGroupId, {
      title: "USD overview debt",
      amount: 6_000,
      currency: "USD",
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }, { userId: bobId }],
    })

    const after = await apiJson<BalanceOverview>(page, "/api/v1/balances/overview")
    expect(friendBalance(after, bobId, "RUB") - friendBalance(before, bobId, "RUB")).toBe(2_000)
    expect(friendBalance(after, bobId, "USD") - friendBalance(before, bobId, "USD")).toBe(3_000)
    expect(
      after.friendBalances.find((balance) => balance.userId === bobId && balance.currency === "RUB")
        ?.groups
    ).toContain(rubName)
    expect(
      after.friendBalances.find((balance) => balance.userId === bobId && balance.currency === "USD")
        ?.groups
    ).toContain(usdName)
  })

  test("removes a fully settled group from both users' outstanding overview", async ({ browser }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const aliceId = (await apiJson<{ user: { id: string } }>(alicePage, "/api/v1/users/me")).user.id
    const bobId = await userId(alicePage, "Боб")
    const groupName = "Fully settled overview E2E"
    const groupId = await createGroup(alicePage, { name: groupName, memberIds: [bobId] })
    await createExpense(alicePage, groupId, {
      title: "Settled overview debt",
      amount: 2_000,
      currency: "RUB",
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }, { userId: bobId }],
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
        date: "2026-09-13",
      },
    })

    const aliceOverview = await apiJson<BalanceOverview>(alicePage, "/api/v1/balances/overview")
    const bobOverview = await apiJson<BalanceOverview>(bobPage, "/api/v1/balances/overview")
    expect(aliceOverview.friendBalances.flatMap((balance) => balance.groups)).not.toContain(groupName)
    expect(bobOverview.friendBalances.flatMap((balance) => balance.groups)).not.toContain(groupName)

    await bobContext.close()
    await aliceContext.close()
  })

  test("empty group returns empty raw and simplified balances", async ({ page }) => {
    await login(page, users.alice)
    const groupId = await createGroup(page, { name: "Empty balances E2E" })
    expect(await apiJson(page, `/api/v1/groups/${groupId}/balances`)).toEqual({
      balances: { raw: [], simplified: [] },
    })
  })
})
