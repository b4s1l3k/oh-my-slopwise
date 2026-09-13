import { expect, test } from "@playwright/test"
import { apiJson, createExpense, createGroup, login, userId, users } from "./helpers"

test.describe("expense FX rounding boundaries", () => {
  test("accepts exactly half a settlement minor unit and rejects a value immediately below it", async ({
    page,
  }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const groupId = await createGroup(page, { name: "FX half-unit boundary E2E" })

    const accepted = await createExpense(page, groupId, fxExpense(aliceId, 1, 0.5))
    expect(accepted).toMatchObject({ amount: 1, amountBase: 1, customRate: 0.5 })

    const rejected = await page.request.post(`/api/v1/groups/${groupId}/expenses`, {
      data: fxExpense(aliceId, 1, 0.499_999),
    })
    expect(rejected.status(), await rejected.text()).toBe(422)
    await expect(rejected.json()).resolves.toMatchObject({
      error: { code: "CONVERTED_AMOUNT_TOO_SMALL" },
    })
    const listed = await apiJson<{ expenses: Array<{ id: string }> }>(
      page,
      `/api/v1/groups/${groupId}/expenses`
    )
    expect(listed.expenses.map((expense) => expense.id)).toEqual([accepted.id])
  })

  test("allocates a converted largest remainder deterministically and preserves the exact total", async ({
    page,
  }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const carolId = await userId(page, "Карина")
    const groupId = await createGroup(page, {
      name: "FX largest remainder E2E",
      memberIds: [bobId, carolId],
    })

    const expense = await createExpense(page, groupId, {
      title: "Three indivisible converted units",
      amount: 3,
      currency: "USD",
      customRate: 1.5,
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EXACT",
      splits: [
        { userId: aliceId, amount: 1 },
        { userId: bobId, amount: 1 },
        { userId: carolId, amount: 1 },
      ],
    })

    expect(expense.amountBase).toBe(5)
    expect(expense.splits.map((split) => split.amountBase)).toEqual([2, 2, 1])
    expect(expense.splits.reduce((sum, split) => sum + (split.amountBase ?? 0), 0)).toBe(5)
  })

  test("rejects a conversion when any positive split disappears after minor-unit rounding", async ({
    page,
  }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, {
      name: "FX zero split guard E2E",
      memberIds: [bobId],
    })
    const before = await apiJson<unknown>(page, `/api/v1/groups/${groupId}/expenses`)

    const response = await page.request.post(`/api/v1/groups/${groupId}/expenses`, {
      data: {
        title: "One converted unit for two people",
        amount: 2,
        currency: "USD",
        customRate: 0.5,
        date: "2026-09-13",
        paidById: aliceId,
        splitType: "EXACT",
        splits: [
          { userId: aliceId, amount: 1 },
          { userId: bobId, amount: 1 },
        ],
      },
    })

    expect(response.status(), await response.text()).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CONVERTED_AMOUNT_TOO_SMALL" },
    })
    expect(await apiJson(page, `/api/v1/groups/${groupId}/expenses`)).toEqual(before)
  })

  test("stores the maximum database amount and rejects the first rounded overflow", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const groupId = await createGroup(page, { name: "FX integer maximum E2E" })

    const maximum = await createExpense(
      page,
      groupId,
      fxExpense(aliceId, 2_000_000_000, 1.073_741_823_5)
    )
    expect(maximum.amountBase).toBe(2_147_483_647)

    const overflow = await page.request.post(`/api/v1/groups/${groupId}/expenses`, {
      data: fxExpense(aliceId, 2_000_000_000, 1.073_741_824),
    })
    expect(overflow.status(), await overflow.text()).toBe(422)
    await expect(overflow.json()).resolves.toMatchObject({
      error: { code: "CONVERTED_AMOUNT_TOO_LARGE" },
    })
    const listed = await apiJson<{ expenses: Array<{ id: string }> }>(
      page,
      `/api/v1/groups/${groupId}/expenses`
    )
    expect(listed.expenses.map((expense) => expense.id)).toEqual([maximum.id])
  })

  test("uses the reconciled converted split for a full cash payment", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const carolId = await userId(page, "Карина")
    const groupId = await createGroup(page, {
      name: "FX cash reconciliation E2E",
      memberIds: [bobId, carolId],
    })

    const expense = await createExpense(page, groupId, {
      title: "Cash on an allocated remainder",
      amount: 3,
      currency: "USD",
      customRate: 1.5,
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EXACT",
      splits: [
        { userId: aliceId, amount: 1 },
        { userId: bobId, amount: 1 },
        { userId: carolId, amount: 1 },
      ],
      cashPayments: [{ userId: carolId, amount: 1 }],
    })

    expect(expense.splits.map((split) => split.amountBase)).toEqual([2, 2, 1])
    expect(expense.settlements).toHaveLength(1)
    expect(expense.settlements[0]).toMatchObject({ amount: 1, amountBase: 1, currency: "USD" })
    const result = await apiJson<{
      balances: {
        simplified: Array<{ fromUserId: string; toUserId: string; amount: number }>
      }
    }>(page, `/api/v1/groups/${groupId}/balances`)
    expect(result.balances.simplified).toEqual([
      { fromUserId: bobId, fromUserName: users.bob.name, toUserId: aliceId, toUserName: users.alice.name, amount: 2 },
    ])
  })
})

function fxExpense(userId: string, amount: number, customRate: number) {
  return {
    title: "FX exact boundary",
    amount,
    currency: "USD",
    customRate,
    date: "2026-09-13",
    paidById: userId,
    splitType: "EXACT",
    splits: [{ userId, amount }],
  }
}
