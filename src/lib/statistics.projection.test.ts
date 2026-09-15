import { describe, expect, it } from "vitest"
import type { AchievementMetrics } from "./achievements"
import { buildProfileStatistics } from "./statistics"

const metrics: AchievementMetrics = {
  accountAgeDays: 1,
  profileReady: 0,
  activeGroups: 0,
  groupsCreated: 0,
  invitesCreated: 0,
  expensesCreated: 0,
  expensesParticipated: 0,
  expensesPaid: 0,
  coffeeExpensesPaid: 0,
  createdForOthers: 0,
  uniquePeople: 0,
  maxExpenseParticipants: 0,
  maxPaidParticipants: 0,
  settlementsSent: 0,
  settlementsReceived: 0,
  cashSettlements: 0,
  equalSplits: 0,
  exactSplits: 0,
  percentageSplits: 0,
  splitMethodsUsed: 0,
  customRates: 0,
  currenciesUsed: 0,
  groupTypesUsed: 0,
  homeGroups: 0,
  tripGroups: 0,
  coupleGroups: 0,
  otherGroups: 0,
  maxGroupMembers: 0,
  maxGroupExpenses: 0,
}

describe("profile statistics projection properties", () => {
  it("achievement-only metrics do not leak into the public statistics shape", () => {
    const baseline = buildProfileStatistics(metrics)
    const changed = buildProfileStatistics({
      ...metrics,
      profileReady: 1,
      coffeeExpensesPaid: 999,
      groupTypesUsed: 4,
    })

    expect(changed).toEqual(baseline)
    expect(changed).not.toHaveProperty("profileReady")
    expect(changed).not.toHaveProperty("coffeeExpensesPaid")
    expect(changed).not.toHaveProperty("groupTypesUsed")
  })

  it.each([0, 1, 8, 100] as const)(
    "maps %i lifetime OTHER groups without deriving them from active groups",
    (otherGroups) => {
      const result = buildProfileStatistics({
        ...metrics,
        activeGroups: 1,
        homeGroups: 20,
        tripGroups: 30,
        coupleGroups: 40,
        otherGroups,
      })

      expect(result.groups.other).toBe(otherGroups)
    }
  )

  it("preserves money currency order, duplicate entries, zeros and negative adjustments", () => {
    const money = {
      spent: [
        { currency: "RUB", amount: 0 },
        { currency: "USD", amount: 123 },
        { currency: "RUB", amount: -1 },
      ],
      returned: [
        { currency: "EUR", amount: 50 },
        { currency: "EUR", amount: 25 },
      ],
    }

    expect(buildProfileStatistics(metrics, money).money).toEqual(money)
  })
})
