import { expect, test } from "@playwright/test"
import { apiJson, createExpense, createGroup, login, userId, users } from "./helpers"

test.describe("expense split calculations", () => {
  test("persists deterministic equal rounding and exact splits", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const carolId = await userId(page, "Карина")
    const groupId = await createGroup(page, {
      name: "Expense Splits E2E",
      memberIds: [bobId, carolId],
    })

    const equal = await createExpense(page, groupId, {
      title: "Equal E2E",
      amount: 10_001,
      date: "2026-03-29",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }, { userId: bobId }, { userId: carolId }],
    })
    expect(equal.splits.map((split) => split.amount)).toEqual([3_335, 3_333, 3_333])
    expect(equal.splits.reduce((sum, split) => sum + split.amount, 0)).toBe(equal.amount)
    expect(equal.splits.reduce((sum, split) => sum + (split.amountBase ?? 0), 0)).toBe(
      equal.amountBase
    )
    expect(equal.date).toMatch(/^2026-03-29/)

    const exact = await createExpense(page, groupId, {
      title: "Exact E2E",
      amount: 12_345,
      date: "2026-10-25",
      paidById: bobId,
      splitType: "EXACT",
      splits: [
        { userId: aliceId, amount: 2_345 },
        { userId: bobId, amount: 4_000 },
        { userId: carolId, amount: 6_000 },
      ],
    })
    expect(exact.splits.map((split) => split.amount)).toEqual([2_345, 4_000, 6_000])
    expect(exact.date).toMatch(/^2026-10-25/)
  })

  test("allocates percentage rounding without losing a minor unit", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const carolId = await userId(page, "Карина")
    const groupId = await createGroup(page, {
      name: "Percentage Splits E2E",
      memberIds: [bobId, carolId],
    })

    const expense = await createExpense(page, groupId, {
      title: "Percentage E2E",
      amount: 9_999,
      date: "2024-02-29",
      paidById: carolId,
      splitType: "PERCENTAGE",
      splits: [
        { userId: aliceId, percentage: 3_333 },
        { userId: bobId, percentage: 3_333 },
        { userId: carolId, percentage: 3_334 },
      ],
    })

    expect(expense.splits.map((split) => split.percentage)).toEqual([3_333, 3_333, 3_334])
    expect(expense.splits.reduce((sum, split) => sum + split.amount, 0)).toBe(expense.amount)
    expect(expense.splits.every((split) => split.amount > 0)).toBe(true)
    expect(expense.date).toMatch(/^2024-02-29/)
  })

  test("accepts the minimum and maximum expense amounts", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const groupId = await createGroup(page, { name: "Expense Amount Boundaries E2E" })

    const minimum = await createExpense(page, groupId, {
      title: "One kopek",
      amount: 1,
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }],
    })
    const maximum = await createExpense(page, groupId, {
      title: "Twenty million",
      amount: 2_000_000_000,
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EXACT",
      splits: [{ userId: aliceId, amount: 2_000_000_000 }],
    })

    expect(minimum).toMatchObject({ amount: 1, amountBase: 1 })
    expect(maximum).toMatchObject({ amount: 2_000_000_000, amountBase: 2_000_000_000 })
  })
})
