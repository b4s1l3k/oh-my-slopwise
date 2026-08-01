import { describe, expect, it } from "vitest"
import {
  ACHIEVEMENT_COUNT,
  evaluateAchievements,
  type AchievementMetrics,
} from "@/lib/achievements"

const emptyMetrics: AchievementMetrics = {
  accountAgeDays: 0,
  profileReady: 0,
  activeGroups: 0,
  groupsCreated: 0,
  invitesCreated: 0,
  expensesCreated: 0,
  expensesParticipated: 0,
  expensesPaid: 0,
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

describe("evaluateAchievements", () => {
  it("returns the full achievement collection in a locked state", () => {
    const achievements = evaluateAchievements(emptyMetrics)

    expect(ACHIEVEMENT_COUNT).toBeGreaterThan(40)
    expect(achievements).toHaveLength(ACHIEVEMENT_COUNT)
    expect(achievements.every((achievement) => !achievement.unlocked)).toBe(true)
  })

  it("unlocks achievements when their target is reached", () => {
    const achievements = evaluateAchievements({
      ...emptyMetrics,
      expensesCreated: 10,
      exactSplits: 1,
      activeGroups: 1,
    })

    expect(achievements.find((achievement) => achievement.id === "first-group")?.unlocked).toBe(true)
    expect(achievements.find((achievement) => achievement.id === "expenses-10")?.unlocked).toBe(true)
    expect(achievements.find((achievement) => achievement.id === "exact-1")?.unlocked).toBe(true)
    expect(achievements.find((achievement) => achievement.id === "expenses-50")?.unlocked).toBe(false)
  })

  it("calculates progress and caps its percentage at 100", () => {
    const achievements = evaluateAchievements({
      ...emptyMetrics,
      expensesCreated: 75,
    })

    const fiftyExpenses = achievements.find((achievement) => achievement.id === "expenses-50")
    const twoHundredFiftyExpenses = achievements.find(
      (achievement) => achievement.id === "expenses-250"
    )

    expect(fiftyExpenses).toMatchObject({ unlocked: true, progress: 75, percent: 100 })
    expect(twoHundredFiftyExpenses).toMatchObject({ unlocked: false, progress: 75, percent: 30 })
  })

  it("does not reveal a hidden achievement before it is unlocked", () => {
    const locked = evaluateAchievements({
      ...emptyMetrics,
      expensesCreated: 999,
    }).find((achievement) => achievement.id === "secret-ledger")

    const unlocked = evaluateAchievements({
      ...emptyMetrics,
      expensesCreated: 1000,
    }).find((achievement) => achievement.id === "secret-ledger")

    expect(locked).toMatchObject({
      title: "Секретная ачивка",
      icon: "lock",
      unlocked: false,
      progress: 0,
      target: 1,
      percent: 0,
    })
    expect(unlocked).toMatchObject({
      title: "Тысяча и один чек",
      unlocked: true,
    })
  })

  it("keeps a persisted achievement unlocked after current progress decreases", () => {
    const achievement = evaluateAchievements(
      emptyMetrics,
      new Set(["first-group"])
    ).find((item) => item.id === "first-group")

    expect(achievement).toMatchObject({
      unlocked: true,
      progress: 0,
      target: 1,
    })
  })
})
