import { expect, test, type Page } from "@playwright/test"
import { apiJson, createExpense, createGroup, login, userId, users } from "./helpers"

test.describe("expense transaction rollback", () => {
  test("removes the expense, activity and facts when a converted cash payment cannot be stored", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, {
      name: "Cash conversion rollback E2E",
      memberIds: [bobId],
    })
    const before = await groupFinancialState(page, groupId)

    const response = await page.request.post(`/api/v1/groups/${groupId}/expenses`, {
      data: {
        title: "Must roll back after expense insert",
        amount: 100,
        currency: "USD",
        customRate: 0.4,
        date: "2026-09-13",
        paidById: aliceId,
        splitType: "EXACT",
        splits: [
          { userId: aliceId, amount: 50 },
          { userId: bobId, amount: 50 },
        ],
        cashPayments: [{ userId: bobId, amount: 1 }],
      },
    })

    expect(response.status(), await response.text()).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CONVERTED_AMOUNT_TOO_SMALL" },
    })
    expect(await groupFinancialState(page, groupId)).toEqual(before)
  })

  test("keeps linked cash and the original expense when an edit makes cash exceed the new share", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, {
      name: "Cash edit rollback E2E",
      memberIds: [bobId],
    })
    const expense = await createExpense(page, groupId, {
      title: "Original cash expense",
      amount: 1_000,
      currency: "RUB",
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }, { userId: bobId }],
      cashPayments: [{ userId: bobId, amount: 500 }],
    })
    const before = await expenseFinancialState(page, groupId, expense.id)

    const response = await page.request.patch(`/api/v1/expenses/${expense.id}`, {
      data: {
        title: "Invalid smaller expense",
        amount: 200,
        currency: "RUB",
        date: "2026-09-14",
        paidById: aliceId,
        splitType: "EQUAL",
        splits: [{ userId: aliceId }, { userId: bobId }],
      },
    })

    expect(response.status(), await response.text()).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CASH_PAYMENT_INVALID" },
    })
    expect(await expenseFinancialState(page, groupId, expense.id)).toEqual(before)
  })

  test("does not alter an existing expense when an FX edit overflows database money", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const groupId = await createGroup(page, { name: "FX update rollback E2E" })
    const expense = await createExpense(page, groupId, {
      title: "Original bounded expense",
      amount: 10_000,
      currency: "RUB",
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }],
    })
    const before = await expenseFinancialState(page, groupId, expense.id)

    const response = await page.request.patch(`/api/v1/expenses/${expense.id}`, {
      data: {
        title: "Overflowing edit",
        amount: 2_000_000_000,
        currency: "USD",
        customRate: 2,
        date: "2026-09-14",
        paidById: aliceId,
        splitType: "EXACT",
        splits: [{ userId: aliceId, amount: 2_000_000_000 }],
      },
    })

    expect(response.status(), await response.text()).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CONVERTED_AMOUNT_TOO_LARGE" },
    })
    expect(await expenseFinancialState(page, groupId, expense.id)).toEqual(before)
  })
})

async function groupFinancialState(page: Page, groupId: string) {
  const [expenses, balances, settlements, activity, statistics] = await Promise.all([
    apiJson(page, `/api/v1/groups/${groupId}/expenses`),
    apiJson(page, `/api/v1/groups/${groupId}/balances`),
    apiJson(page, `/api/v1/groups/${groupId}/settlements`),
    apiJson(page, `/api/v1/groups/${groupId}/activity`),
    apiJson(page, "/api/v1/users/me/statistics"),
  ])
  return { expenses, balances, settlements, activity, statistics }
}

async function expenseFinancialState(page: Page, groupId: string, expenseId: string) {
  return {
    expense: await apiJson(page, `/api/v1/expenses/${expenseId}`),
    group: await groupFinancialState(page, groupId),
  }
}
