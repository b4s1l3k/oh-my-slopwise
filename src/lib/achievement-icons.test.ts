import { describe, it, expect } from "vitest"
import {
  Banknote,
  Coffee,
  Crown,
  Handshake,
  Trophy,
  Users,
  Wallet,
} from "lucide-react"
import { achievementIconMap, getAchievementIcon } from "@/lib/achievement-icons"
import { evaluateAchievements, type AchievementMetrics } from "@/lib/achievements"

// Every metric maxed out so that every achievement (including hidden ones) is
// unlocked. When unlocked, evaluateAchievements returns each definition's real
// `icon` string instead of the "lock" placeholder, letting us recover the full
// set of icon strings referenced by the private `definitions` array.
const maxMetrics: AchievementMetrics = {
  accountAgeDays: 1_000_000,
  profileReady: 1_000_000,
  activeGroups: 1_000_000,
  groupsCreated: 1_000_000,
  invitesCreated: 1_000_000,
  expensesCreated: 1_000_000,
  expensesParticipated: 1_000_000,
  expensesPaid: 1_000_000,
  coffeeExpensesPaid: 1_000_000,
  createdForOthers: 1_000_000,
  uniquePeople: 1_000_000,
  maxExpenseParticipants: 1_000_000,
  maxPaidParticipants: 1_000_000,
  settlementsSent: 1_000_000,
  settlementsReceived: 1_000_000,
  cashSettlements: 1_000_000,
  equalSplits: 1_000_000,
  exactSplits: 1_000_000,
  percentageSplits: 1_000_000,
  splitMethodsUsed: 1_000_000,
  customRates: 1_000_000,
  currenciesUsed: 1_000_000,
  groupTypesUsed: 1_000_000,
  homeGroups: 1_000_000,
  tripGroups: 1_000_000,
  coupleGroups: 1_000_000,
  maxGroupMembers: 1_000_000,
  maxGroupExpenses: 1_000_000,
}

const definitionIconStrings = Array.from(
  new Set(evaluateAchievements(maxMetrics).map((achievement) => achievement.icon))
)

describe("getAchievementIcon", () => {
  it("returns the mapped component for known keys", () => {
    expect(getAchievementIcon("banknote")).toBe(Banknote)
    expect(getAchievementIcon("coffee")).toBe(Coffee)
    expect(getAchievementIcon("crown")).toBe(Crown)
    expect(getAchievementIcon("handshake")).toBe(Handshake)
    expect(getAchievementIcon("wallet")).toBe(Wallet)
  })

  it("maps both 'users' and 'users-round' to the Users component", () => {
    expect(getAchievementIcon("users")).toBe(Users)
    expect(getAchievementIcon("users-round")).toBe(Users)
  })

  it("returns every mapped component exactly as registered in achievementIconMap", () => {
    for (const [key, component] of Object.entries(achievementIconMap)) {
      expect(getAchievementIcon(key)).toBe(component)
    }
  })

  it("returns the Trophy fallback for an unknown key", () => {
    expect(getAchievementIcon("definitely-not-a-real-icon")).toBe(Trophy)
  })

  it("returns the Trophy fallback for the empty string", () => {
    expect(getAchievementIcon("")).toBe(Trophy)
  })

  it("returns the Trophy fallback for 'trophy' itself (no such map key)", () => {
    // "trophy" is not a key in achievementIconMap, so it resolves via the
    // fallback branch — which happens to also be the Trophy component.
    expect(getAchievementIcon("trophy")).toBe(Trophy)
    expect(achievementIconMap.trophy).toBeUndefined()
  })
})

describe("achievementIconMap coverage of achievement definitions", () => {
  it("derives a non-trivial set of icon strings from the definitions", () => {
    expect(definitionIconStrings.length).toBeGreaterThan(30)
  })

  it("does not use the 'lock' placeholder for any unlocked definition icon", () => {
    // Sanity check that maxMetrics really unlocked everything.
    expect(definitionIconStrings).not.toContain("lock")
  })

  it("maps EVERY icon referenced by an achievement definition (no Trophy fallbacks)", () => {
    // Regression guard: if a definition ever references an icon string that is
    // missing from achievementIconMap, that achievement would silently render
    // the generic Trophy fallback instead of its intended icon.
    const missing = definitionIconStrings.filter((icon) => getAchievementIcon(icon) === Trophy)
    expect(missing).toEqual([])
  })

  it("maps 'chart-pie' (used by the 'percentage-10' achievement)", () => {
    expect(definitionIconStrings).toContain("chart-pie")
    expect(achievementIconMap["chart-pie"]).toBeDefined()
    expect(getAchievementIcon("chart-pie")).not.toBe(Trophy)
  })
})
