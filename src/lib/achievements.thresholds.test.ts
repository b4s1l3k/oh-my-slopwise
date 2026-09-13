import { describe, expect, it } from "vitest"
import {
  evaluateAchievements,
  type AchievementCategory,
  type AchievementMetrics,
} from "./achievements"

const zeroMetrics: AchievementMetrics = {
  accountAgeDays: 0,
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
  maxGroupMembers: 0,
  maxGroupExpenses: 0,
}

type ThresholdCase = {
  id: string
  metric: keyof AchievementMetrics
  target: number
  category: AchievementCategory
}

const thresholds: ThresholdCase[] = [
  { id: "first-group", metric: "activeGroups", target: 1, category: "START" },
  { id: "first-expense", metric: "expensesCreated", target: 1, category: "START" },
  { id: "first-participation", metric: "expensesParticipated", target: 1, category: "START" },
  { id: "first-settlement", metric: "settlementsSent", target: 1, category: "START" },
  { id: "profile-ready", metric: "profileReady", target: 1, category: "START" },
  { id: "first-invite", metric: "invitesCreated", target: 1, category: "START" },
  { id: "expenses-10", metric: "expensesCreated", target: 10, category: "ACTIVITY" },
  { id: "expenses-50", metric: "expensesCreated", target: 50, category: "ACTIVITY" },
  { id: "expenses-250", metric: "expensesCreated", target: 250, category: "ACTIVITY" },
  { id: "secret-ledger", metric: "expensesCreated", target: 1_000, category: "ACTIVITY" },
  { id: "paid-10", metric: "expensesPaid", target: 10, category: "ACTIVITY" },
  { id: "paid-50", metric: "expensesPaid", target: 50, category: "ACTIVITY" },
  { id: "participated-25", metric: "expensesParticipated", target: 25, category: "ACTIVITY" },
  { id: "participated-100", metric: "expensesParticipated", target: 100, category: "ACTIVITY" },
  { id: "account-year", metric: "accountAgeDays", target: 365, category: "ACTIVITY" },
  { id: "people-3", metric: "uniquePeople", target: 3, category: "TEAM" },
  { id: "people-10", metric: "uniquePeople", target: 10, category: "TEAM" },
  { id: "people-25", metric: "uniquePeople", target: 25, category: "TEAM" },
  { id: "expense-people-5", metric: "maxExpenseParticipants", target: 5, category: "TEAM" },
  { id: "expense-people-10", metric: "maxExpenseParticipants", target: 10, category: "TEAM" },
  { id: "created-for-other", metric: "createdForOthers", target: 1, category: "TEAM" },
  { id: "created-for-other-25", metric: "createdForOthers", target: 25, category: "TEAM" },
  { id: "paid-for-10", metric: "maxPaidParticipants", target: 10, category: "TEAM" },
  { id: "settlements-10", metric: "settlementsSent", target: 10, category: "SETTLEMENTS" },
  { id: "settlements-50", metric: "settlementsSent", target: 50, category: "SETTLEMENTS" },
  { id: "cash-1", metric: "cashSettlements", target: 1, category: "SETTLEMENTS" },
  { id: "cash-10", metric: "cashSettlements", target: 10, category: "SETTLEMENTS" },
  { id: "received-10", metric: "settlementsReceived", target: 10, category: "SETTLEMENTS" },
  { id: "equal-10", metric: "equalSplits", target: 10, category: "MASTERY" },
  { id: "exact-1", metric: "exactSplits", target: 1, category: "MASTERY" },
  { id: "exact-10", metric: "exactSplits", target: 10, category: "MASTERY" },
  { id: "percentage-1", metric: "percentageSplits", target: 1, category: "MASTERY" },
  { id: "percentage-10", metric: "percentageSplits", target: 10, category: "MASTERY" },
  { id: "all-split-methods", metric: "splitMethodsUsed", target: 3, category: "MASTERY" },
  { id: "custom-rate", metric: "customRates", target: 1, category: "MASTERY" },
  { id: "currencies-3", metric: "currenciesUsed", target: 3, category: "MASTERY" },
  { id: "currencies-5", metric: "currenciesUsed", target: 5, category: "MASTERY" },
  { id: "groups-3", metric: "activeGroups", target: 3, category: "GROUPS" },
  { id: "groups-10", metric: "activeGroups", target: 10, category: "GROUPS" },
  { id: "groups-created-3", metric: "groupsCreated", target: 3, category: "GROUPS" },
  { id: "home-group", metric: "homeGroups", target: 1, category: "GROUPS" },
  { id: "trip-group", metric: "tripGroups", target: 1, category: "GROUPS" },
  { id: "couple-group", metric: "coupleGroups", target: 1, category: "GROUPS" },
  { id: "all-group-types", metric: "groupTypesUsed", target: 4, category: "GROUPS" },
  { id: "group-members-5", metric: "maxGroupMembers", target: 5, category: "GROUPS" },
  { id: "group-members-10", metric: "maxGroupMembers", target: 10, category: "GROUPS" },
  { id: "group-expenses-50", metric: "maxGroupExpenses", target: 50, category: "GROUPS" },
  { id: "group-expenses-250", metric: "maxGroupExpenses", target: 250, category: "GROUPS" },
  { id: "secret-coffee-path", metric: "coffeeExpensesPaid", target: 1, category: "ACTIVITY" },
]

describe("achievement threshold compatibility matrix", () => {
  it.each(thresholds)("unlocks $id exactly when $metric reaches $target", ({ id, metric, target }) => {
    const below = evaluateAchievements({ ...zeroMetrics, [metric]: target - 1 })
      .find((achievement) => achievement.id === id)
    const at = evaluateAchievements({ ...zeroMetrics, [metric]: target })
      .find((achievement) => achievement.id === id)

    expect(below?.unlocked).toBe(false)
    expect(at?.unlocked).toBe(true)
  })

  it("pins every public id, category and target", () => {
    const allMetrics = Object.fromEntries(
      Object.keys(zeroMetrics).map((metric) => [metric, 10_000])
    ) as AchievementMetrics
    const actual = evaluateAchievements(allMetrics).map(({ id, category, target }) => ({
      id,
      category,
      target,
    }))
    const expected = thresholds.map(({ id, category, target }) => ({ id, category, target }))

    expect(actual).toEqual(expected)
  })

  it.each([
    [1, 250, 0],
    [124, 250, 50],
    [125, 250, 50],
    [126, 250, 50],
    [248, 250, 99],
    [249, 250, 100],
    [250, 250, 100],
  ] as const)("rounds progress %i of %i to %i percent", (progress, _target, percent) => {
    const achievement = evaluateAchievements({
      ...zeroMetrics,
      expensesCreated: progress,
    }).find((item) => item.id === "expenses-250")

    expect(achievement?.percent).toBe(percent)
  })

  it("ignores persisted ids that are not part of the definition catalog", () => {
    const baseline = evaluateAchievements(zeroMetrics)
    const withUnknown = evaluateAchievements(zeroMetrics, new Set(["removed-achievement"]))

    expect(withUnknown).toEqual(baseline)
  })
})
