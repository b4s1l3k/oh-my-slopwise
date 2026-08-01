import { describe, expect, it } from "vitest"
import type { AchievementMetrics } from "@/lib/achievements"
import { buildProfileStatistics } from "@/lib/statistics"

const metrics: AchievementMetrics = {
  accountAgeDays: 42,
  profileReady: 1,
  activeGroups: 7,
  groupsCreated: 3,
  invitesCreated: 5,
  expensesCreated: 20,
  expensesParticipated: 31,
  expensesPaid: 14,
  coffeeExpensesPaid: 2,
  createdForOthers: 4,
  uniquePeople: 9,
  maxExpenseParticipants: 6,
  maxPaidParticipants: 5,
  settlementsSent: 8,
  settlementsReceived: 7,
  cashSettlements: 2,
  equalSplits: 12,
  exactSplits: 5,
  percentageSplits: 3,
  splitMethodsUsed: 3,
  customRates: 4,
  currenciesUsed: 3,
  groupTypesUsed: 4,
  homeGroups: 2,
  tripGroups: 2,
  coupleGroups: 1,
  maxGroupMembers: 10,
  maxGroupExpenses: 80,
}

describe("buildProfileStatistics", () => {
  it("maps achievement metrics into stable public statistics", () => {
    expect(buildProfileStatistics(metrics)).toEqual({
      money: { spent: [], returned: [] },
      overview: {
        expensesParticipated: 31,
        expensesCreated: 20,
        expensesPaid: 14,
        activeGroups: 7,
      },
      splits: { equal: 12, exact: 5, percentage: 3 },
      collaboration: {
        uniquePeople: 9,
        settlementsSent: 8,
        settlementsReceived: 7,
        cashSettlements: 2,
        invitesCreated: 5,
        createdForOthers: 4,
      },
      groups: { created: 3, home: 2, trip: 2, couple: 1, other: 2 },
      mastery: { currenciesUsed: 3, splitMethodsUsed: 3, customRates: 4 },
      records: {
        maxExpenseParticipants: 6,
        maxPaidParticipants: 5,
        maxGroupMembers: 10,
        maxGroupExpenses: 80,
        accountAgeDays: 42,
      },
    })
  })

  it("includes monetary totals without combining currencies", () => {
    const money = {
      spent: [
        { currency: "EUR", amount: 5_000 },
        { currency: "RUB", amount: 125_000 },
      ],
      returned: [{ currency: "RUB", amount: 40_000 }],
    }

    expect(buildProfileStatistics(metrics, money).money).toEqual(money)
  })
})
