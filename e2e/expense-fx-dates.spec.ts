import { expect, test } from "@playwright/test"
import { apiJson, createExpense, createGroup, login, userId, users } from "./helpers"

test.describe("expense FX and calendar dates", () => {
  test("persists manual FX conversion and reconciles converted splits", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const carolId = await userId(page, "Карина")
    const groupId = await createGroup(page, {
      name: "Expense FX E2E",
      currency: "RUB",
      memberIds: [bobId, carolId],
    })

    const expense = await createExpense(page, groupId, {
      title: "FX E2E",
      amount: 10_001,
      currency: "USD",
      customRate: 91.2345,
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }, { userId: bobId }, { userId: carolId }],
    })

    expect(expense).toMatchObject({ currency: "USD", customRate: 91.2345, amountBase: 912_436 })
    expect(expense.splits.reduce((sum, split) => sum + (split.amountBase ?? 0), 0)).toBe(
      expense.amountBase
    )
    expect(expense.splits.every((split) => (split.amountBase ?? 0) > 0)).toBe(true)
  })

  test("keeps business dates stable across leap day and DST boundaries", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const groupId = await createGroup(page, { name: "Expense Calendar Dates E2E" })

    for (const date of ["2024-02-29", "2026-03-29", "2026-10-25", "2026-12-31"]) {
      const expense = await createExpense(page, groupId, {
        title: `Date ${date}`,
        amount: 100,
        date,
        paidById: aliceId,
        splitType: "EQUAL",
        splits: [{ userId: aliceId }],
      })
      expect(expense.date, date).toMatch(new RegExp(`^${date}`))
      const fetched = await apiJson<{ expense: { date: string } }>(
        page,
        `/api/v1/expenses/${expense.id}`
      )
      expect(fetched.expense.date, date).toMatch(new RegExp(`^${date}`))
    }
  })

  test("preserves linked cash money while changing payer, expense currency and date", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const carolId = await userId(page, "Карина")
    const groupId = await createGroup(page, {
      name: "Expense FX Edit E2E",
      memberIds: [bobId, carolId],
    })
    const original = await createExpense(page, groupId, {
      title: "Before Edit",
      amount: 10_000,
      currency: "USD",
      customRate: 90,
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }, { userId: bobId }],
      cashPayments: [{ userId: bobId, amount: 1_000 }],
    })

    const response = await page.request.patch(`/api/v1/expenses/${original.id}`, {
      data: {
        title: "After Edit",
        amount: 20_000,
        currency: "EUR",
        customRate: 100,
        date: "2026-09-14",
        paidById: carolId,
        splitType: "EXACT",
        splits: [
          { userId: aliceId, amount: 5_000 },
          { userId: bobId, amount: 5_000 },
          { userId: carolId, amount: 10_000 },
        ],
      },
    })
    expect(response.status(), await response.text()).toBe(200)
    const updated = (await response.json() as { expense: typeof original }).expense
    expect(updated).toMatchObject({
      title: "After Edit",
      paidById: carolId,
      currency: "EUR",
      amountBase: 2_000_000,
      date: expect.stringMatching(/^2026-09-14/),
    })
    expect(updated.settlements).toHaveLength(1)
    expect(updated.settlements[0]).toMatchObject({
      amount: 1_000,
      currency: "USD",
      amountBase: 90_000,
    })
    expect(updated.splits.reduce((sum, split) => sum + (split.amountBase ?? 0), 0)).toBe(
      updated.amountBase
    )
  })

  test("rejects FX values that round to zero or overflow database money", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const groupId = await createGroup(page, { name: "Expense FX Boundaries E2E" })

    const tooSmall = await page.request.post(`/api/v1/groups/${groupId}/expenses`, {
      data: fxExpense(aliceId, 1, 0.4),
    })
    expect(tooSmall.status(), await tooSmall.text()).toBe(422)
    await expect(tooSmall.json()).resolves.toMatchObject({
      error: { code: "CONVERTED_AMOUNT_TOO_SMALL" },
    })

    const tooLarge = await page.request.post(`/api/v1/groups/${groupId}/expenses`, {
      data: fxExpense(aliceId, 2_000_000_000, 2),
    })
    expect(tooLarge.status(), await tooLarge.text()).toBe(422)
    await expect(tooLarge.json()).resolves.toMatchObject({
      error: { code: "CONVERTED_AMOUNT_TOO_LARGE" },
    })
  })
})

function fxExpense(userId: string, amount: number, customRate: number) {
  return {
    title: "FX boundary",
    amount,
    currency: "USD",
    customRate,
    date: "2026-09-13",
    paidById: userId,
    splitType: "EQUAL",
    splits: [{ userId }],
  }
}
