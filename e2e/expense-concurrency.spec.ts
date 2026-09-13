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

test.describe("concurrent expense operations", () => {
  test("persists concurrent expenses from different members without losing either", async ({ browser }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const aliceId = (await apiJson<{ user: { id: string } }>(alicePage, "/api/v1/users/me")).user.id
    const bobId = await userId(alicePage, "Боб")
    const groupId = await createGroup(alicePage, {
      name: "Concurrent expense create E2E",
      memberIds: [bobId],
    })
    const bobContext = await authenticatedContext(browser, users.bob)
    const bobPage = bobContext.pages()[0]

    const [aliceResponse, bobResponse] = await Promise.all([
      alicePage.request.post(`/api/v1/groups/${groupId}/expenses`, {
        data: expenseCommand("Alice concurrent expense", 2_000, aliceId, [aliceId, bobId]),
      }),
      bobPage.request.post(`/api/v1/groups/${groupId}/expenses`, {
        data: expenseCommand("Bob concurrent expense", 600, bobId, [aliceId, bobId]),
      }),
    ])

    expect([aliceResponse.status(), bobResponse.status()]).toEqual([201, 201])
    const listed = await apiJson<{ expenses: Array<{ title: string }> }>(
      alicePage,
      `/api/v1/groups/${groupId}/expenses`
    )
    expect(listed.expenses.map(({ title }) => title).sort()).toEqual([
      "Alice concurrent expense",
      "Bob concurrent expense",
    ])
    const balances = await apiJson<{
      balances: { simplified: Array<{ fromUserId: string; toUserId: string; amount: number }> }
    }>(alicePage, `/api/v1/groups/${groupId}/balances`)
    expect(balances.balances.simplified).toMatchObject([
      { fromUserId: bobId, toUserId: aliceId, amount: 700 },
    ])

    await bobContext.close()
    await aliceContext.close()
  })

  test("concurrent edits leave one complete aggregate rather than mixed fields or splits", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, {
      name: "Concurrent expense edit E2E",
      memberIds: [bobId],
    })
    const expense = await createExpense(
      page,
      groupId,
      expenseCommand("Before concurrent edit", 1_000, aliceId, [aliceId, bobId])
    )
    const equal = expenseCommand("Concurrent equal edit", 2_000, aliceId, [aliceId, bobId])
    const exact = {
      ...expenseCommand("Concurrent exact edit", 3_000, bobId, [aliceId, bobId]),
      splitType: "EXACT",
      splits: [
        { userId: aliceId, amount: 500 },
        { userId: bobId, amount: 2_500 },
      ],
    }

    const responses = await Promise.all([
      page.request.patch(`/api/v1/expenses/${expense.id}`, { data: equal }),
      page.request.patch(`/api/v1/expenses/${expense.id}`, { data: exact }),
    ])
    expect(responses.map((response) => response.status())).toEqual([200, 200])

    const final = await apiJson<{
      expense: {
        title: string
        amount: number
        paidById: string
        splitType: string
        splits: Array<{ userId: string; amount: number }>
      }
    }>(page, `/api/v1/expenses/${expense.id}`)
    const snapshot = {
      title: final.expense.title,
      amount: final.expense.amount,
      paidById: final.expense.paidById,
      splitType: final.expense.splitType,
      splits: final.expense.splits.map(({ userId, amount }) => ({ userId, amount })),
    }
    expect([
      {
        title: "Concurrent equal edit",
        amount: 2_000,
        paidById: aliceId,
        splitType: "EQUAL",
        splits: [{ userId: aliceId, amount: 1_000 }, { userId: bobId, amount: 1_000 }],
      },
      {
        title: "Concurrent exact edit",
        amount: 3_000,
        paidById: bobId,
        splitType: "EXACT",
        splits: [{ userId: aliceId, amount: 500 }, { userId: bobId, amount: 2_500 }],
      },
    ]).toContainEqual(snapshot)
  })

  test("concurrent deletion removes an expense and writes deletion activity once", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const groupId = await createGroup(page, { name: "Concurrent expense delete E2E" })
    const expense = await createExpense(
      page,
      groupId,
      expenseCommand("Delete concurrently", 1_000, aliceId, [aliceId])
    )

    const responses = await Promise.all([
      page.request.delete(`/api/v1/expenses/${expense.id}`),
      page.request.delete(`/api/v1/expenses/${expense.id}`),
    ])

    expect(responses.map((response) => response.status()).sort()).toEqual([200, 404])
    expect((await page.request.get(`/api/v1/expenses/${expense.id}`)).status()).toBe(404)
    const listed = await apiJson<{ expenses: Array<{ id: string }> }>(
      page,
      `/api/v1/groups/${groupId}/expenses`
    )
    expect(listed.expenses).toEqual([])
    const activity = await apiJson<{
      activities: Array<{ type: string; entityId: string }>
    }>(page, `/api/v1/groups/${groupId}/activity`)
    expect(
      activity.activities.filter(
        ({ type, entityId }) => type === "EXPENSE_DELETED" && entityId === expense.id
      )
    ).toHaveLength(1)
  })
})

function expenseCommand(title: string, amount: number, paidById: string, participantIds: string[]) {
  return {
    title,
    amount,
    currency: "RUB",
    date: "2026-09-13",
    paidById,
    splitType: "EQUAL",
    splits: participantIds.map((userId) => ({ userId })),
  }
}
