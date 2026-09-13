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

type Statistics = {
  money: {
    spent: Array<{ currency: string; amount: number }>
    returned: Array<{ currency: string; amount: number }>
  }
  overview: {
    expensesParticipated: number
    expensesCreated: number
    expensesPaid: number
    activeGroups: number
  }
  splits: { equal: number; exact: number; percentage: number }
  collaboration: {
    uniquePeople: number
    settlementsSent: number
    settlementsReceived: number
    cashSettlements: number
    invitesCreated: number
    createdForOthers: number
  }
  groups: { created: number; home: number; trip: number; couple: number; other: number }
  mastery: { currenciesUsed: number; splitMethodsUsed: number; customRates: number }
  records: {
    maxExpenseParticipants: number
    maxPaidParticipants: number
    maxGroupMembers: number
    maxGroupExpenses: number
    accountAgeDays: number
  }
}

async function statistics(page: Parameters<typeof apiJson>[0]): Promise<Statistics> {
  return (await apiJson<{ statistics: Statistics }>(page, "/api/v1/users/me/statistics")).statistics
}

function moneyAmount(values: Array<{ currency: string; amount: number }>, currency: string): number {
  return values.find((value) => value.currency === currency)?.amount ?? 0
}

test.describe("lifetime statistics", () => {
  test("retains completed history after deleting an expense and its group", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const before = await statistics(page)
    const groupId = await createGroup(page, {
      name: "Deleted lifetime E2E",
      type: "HOME",
    })
    const expense = await createExpense(page, groupId, {
      title: "Deleted historical expense",
      amount: 12_345,
      currency: "RUB",
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }],
    })
    await apiJson(page, `/api/v1/expenses/${expense.id}`, { method: "DELETE" })
    await apiJson(page, `/api/v1/groups/${groupId}`, { method: "DELETE" })

    const after = await statistics(page)
    expect(after.groups.created - before.groups.created).toBe(1)
    expect(after.groups.home - before.groups.home).toBe(1)
    expect(after.overview.expensesCreated - before.overview.expensesCreated).toBe(1)
    expect(after.overview.expensesParticipated - before.overview.expensesParticipated).toBe(1)
    expect(after.overview.expensesPaid - before.overview.expensesPaid).toBe(1)
    expect(after.splits.equal - before.splits.equal).toBe(1)
    expect(moneyAmount(after.money.spent, "RUB") - moneyAmount(before.money.spent, "RUB"))
      .toBe(12_345)
  })

  test("an edit moves payer statistics and replaces split semantics instead of duplicating them", async ({ browser }) => {
    const outsiderContext = await authenticatedContext(browser, users.outsider)
    const outsiderPage = outsiderContext.pages()[0]
    const outsiderId = (await apiJson<{ user: { id: string } }>(outsiderPage, "/api/v1/users/me")).user.id
    const carolId = await userId(outsiderPage, "Карина")
    const outsiderBefore = await statistics(outsiderPage)
    const carolContext = await authenticatedContext(browser, users.carol)
    const carolPage = carolContext.pages()[0]
    const carolBefore = await statistics(carolPage)
    const groupId = await createGroup(outsiderPage, {
      name: "Corrected statistics E2E",
      memberIds: [carolId],
    })
    const expense = await createExpense(outsiderPage, groupId, {
      title: "Before correction",
      amount: 4_000,
      currency: "RUB",
      date: "2026-09-13",
      paidById: outsiderId,
      splitType: "EQUAL",
      splits: [{ userId: outsiderId }, { userId: carolId }],
    })
    await apiJson(outsiderPage, `/api/v1/expenses/${expense.id}`, {
      method: "PATCH",
      body: {
        title: "After correction",
        amount: 4_000,
        currency: "USD",
        customRate: 1.25,
        date: "2026-09-14",
        paidById: carolId,
        splitType: "PERCENTAGE",
        splits: [
          { userId: outsiderId, percentage: 5_000 },
          { userId: carolId, percentage: 5_000 },
        ],
      },
    })

    const outsiderAfter = await statistics(outsiderPage)
    const carolAfter = await statistics(carolPage)
    expect(outsiderAfter.overview.expensesCreated - outsiderBefore.overview.expensesCreated).toBe(1)
    expect(outsiderAfter.overview.expensesPaid - outsiderBefore.overview.expensesPaid).toBe(0)
    expect(outsiderAfter.splits.equal - outsiderBefore.splits.equal).toBe(0)
    expect(outsiderAfter.splits.percentage - outsiderBefore.splits.percentage).toBe(1)
    expect(
      outsiderAfter.collaboration.createdForOthers - outsiderBefore.collaboration.createdForOthers
    ).toBe(1)
    expect(outsiderAfter.mastery.customRates - outsiderBefore.mastery.customRates).toBe(1)
    expect(moneyAmount(outsiderAfter.money.spent, "RUB") - moneyAmount(outsiderBefore.money.spent, "RUB"))
      .toBe(0)
    expect(carolAfter.overview.expensesPaid - carolBefore.overview.expensesPaid).toBe(1)
    expect(moneyAmount(carolAfter.money.spent, "USD") - moneyAmount(carolBefore.money.spent, "USD"))
      .toBe(4_000)

    await carolContext.close()
    await outsiderContext.close()
  })
})
