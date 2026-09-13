import { expect, test, type Page } from "@playwright/test"
import {
  apiJson,
  authenticatedContext,
  createExpense,
  createGroup,
  login,
  userId,
  users,
} from "./helpers"

test.describe("expense cash payments and settlements", () => {
  test("cash payment reduces debt and a manual settlement clears it", async ({ browser }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const aliceId = (await apiJson<{ user: { id: string } }>(alicePage, "/api/v1/users/me")).user.id
    const bobId = await userId(alicePage, "Боб")
    const groupId = await createGroup(alicePage, {
      name: "Expense Settlement E2E",
      memberIds: [bobId],
    })

    const expense = await createExpense(alicePage, groupId, {
      title: "Cash E2E",
      amount: 10_000,
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }, { userId: bobId }],
      cashPayments: [{ userId: bobId, amount: 2_000 }],
    })
    expect(expense.settlements).toHaveLength(1)
    expect(expense.settlements[0]).toMatchObject({
      amount: 2_000,
      amountBase: 2_000,
      currency: "RUB",
    })
    expect((await balances(alicePage, groupId)).simplified).toEqual([{
      fromUserId: bobId,
      fromUserName: users.bob.name,
      toUserId: aliceId,
      toUserName: users.alice.name,
      amount: 3_000,
    }])

    const bobContext = await authenticatedContext(browser, users.bob)
    const bobPage = bobContext.pages()[0]
    await apiJson(bobPage, "/api/v1/settlements", {
      method: "POST",
      expectedStatus: 201,
      body: {
        groupId,
        toUserId: aliceId,
        amount: 3_000,
        currency: "RUB",
        date: "2026-09-13",
        notes: "E2E paid",
      },
    })
    expect((await balances(bobPage, groupId)).simplified).toEqual([])

    await bobContext.close()
    await aliceContext.close()
  })

  test("rejects malformed, duplicate and excessive cash payments", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, {
      name: "Expense Cash Validation E2E",
      memberIds: [bobId],
    })
    const base = {
      title: "Cash validation",
      amount: 100,
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }, { userId: bobId }],
    }
    const invalidPayments = [
      [{ userId: bobId, amount: 51 }],
      [{ userId: aliceId, amount: 1 }],
      [{ userId: bobId, amount: 0 }],
      [{ userId: bobId, amount: 1.5 }],
      [{ userId: bobId, amount: 1 }, { userId: bobId, amount: 2 }],
    ]

    for (const cashPayments of invalidPayments) {
      const response = await page.request.post(`/api/v1/groups/${groupId}/expenses`, {
        data: { ...base, cashPayments },
      })
      expect(response.status(), JSON.stringify(cashPayments)).toBe(422)
    }
  })

  test("cash payments are create-only on the expense API", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, {
      name: "Expense Cash Update E2E",
      memberIds: [bobId],
    })
    const body = {
      title: "Cash create only",
      amount: 1_000,
      currency: "RUB",
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }, { userId: bobId }],
    }
    const expense = await createExpense(page, groupId, body)

    const response = await page.request.patch(`/api/v1/expenses/${expense.id}`, {
      data: { ...body, cashPayments: [{ userId: bobId, amount: 100 }] },
    })
    expect(response.status(), await response.text()).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CASH_PAYMENTS_CREATE_ONLY" },
    })
  })

  test("rejects self, absent and excessive manual settlements", async ({ browser }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const aliceId = (await apiJson<{ user: { id: string } }>(alicePage, "/api/v1/users/me")).user.id
    const bobId = await userId(alicePage, "Боб")
    const carolId = await userId(alicePage, "Карина")
    const groupId = await createGroup(alicePage, {
      name: "Settlement Validation E2E",
      memberIds: [bobId, carolId],
    })
    await createExpense(alicePage, groupId, {
      title: "Debt for settlement validation",
      amount: 1_000,
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }, { userId: bobId }],
    })

    const bobContext = await authenticatedContext(browser, users.bob)
    const bobPage = bobContext.pages()[0]
    await expectSettlementError(bobPage, {
      groupId,
      toUserId: bobId,
      amount: 1,
      currency: "RUB",
      date: "2026-09-13",
    }, "SELF_SETTLEMENT")
    await expectSettlementError(bobPage, {
      groupId,
      toUserId: carolId,
      amount: 1,
      currency: "RUB",
      date: "2026-09-13",
    }, "NO_DEBT")
    await expectSettlementError(bobPage, {
      groupId,
      toUserId: aliceId,
      amount: 501,
      currency: "RUB",
      date: "2026-09-13",
    }, "AMOUNT_EXCEEDS_DEBT")

    const invalidDate = await bobPage.request.post("/api/v1/settlements", {
      data: {
        groupId,
        toUserId: aliceId,
        amount: 100,
        currency: "RUB",
        date: "2026-02-30",
      },
    })
    expect(invalidDate.status()).toBe(422)

    await bobContext.close()
    await aliceContext.close()
  })
})

async function balances(page: Page, groupId: string) {
  return (await apiJson<{
    balances: {
      simplified: Array<{
        fromUserId: string
        fromUserName: string
        toUserId: string
        toUserName: string
        amount: number
      }>
    }
  }>(page, `/api/v1/groups/${groupId}/balances`)).balances
}

async function expectSettlementError(
  page: Page,
  body: Record<string, unknown>,
  code: string
) {
  const response = await page.request.post("/api/v1/settlements", { data: body })
  expect(response.status(), await response.text()).toBe(422)
  await expect(response.json()).resolves.toMatchObject({ error: { code } })
}
