import { describe, expect, it } from "vitest"
import {
  ACHIEVEMENT_CATEGORY_LABELS,
  ACHIEVEMENT_COUNT,
  evaluateAchievements,
  isCoffeeExpense,
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

describe("evaluateAchievements", () => {
  it("returns the full achievement collection in a locked state", () => {
    const achievements = evaluateAchievements(emptyMetrics)

    // Точное число ачивок (пинним, чтобы изменение набора было явным сигналом).
    // toHaveLength(65) — не тавтология: сравниваем длину map-результата с константой.
    expect(ACHIEVEMENT_COUNT).toBe(65)
    expect(achievements).toHaveLength(65)
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
      title: "Чеканос: Война бесконечных трат",
      unlocked: true,
    })
  })

  it("keeps only the rare geek achievements secret", () => {
    const lockedSecrets = evaluateAchievements(emptyMetrics).filter(
      (achievement) => achievement.hidden
    )
    expect(lockedSecrets.map((achievement) => achievement.id).sort()).toEqual([
      "secret-coffee-path",
      "secret-feast",
      "secret-ledger",
    ])
    expect(
      lockedSecrets.every(
        (achievement) =>
          achievement.title === "Секретная ачивка" &&
          achievement.description === "Условие откроется вместе с наградой" &&
          achievement.icon === "lock"
      )
    ).toBe(true)

    const unlocked = evaluateAchievements({
      ...emptyMetrics,
      expensesCreated: 1,
      settlementsSent: 1,
      percentageSplits: 1,
    })
    expect(unlocked.find((item) => item.id === "secret-wizard-accountant")).toMatchObject({
      title: "Ты бухгалтер, Гарри",
      unlocked: true,
      hidden: false,
    })
    expect(unlocked.find((item) => item.id === "secret-force-balance")).toMatchObject({
      title: "Да пребудет с тобой баланс",
      unlocked: true,
      hidden: false,
    })
    expect(unlocked.find((item) => item.id === "secret-expensium-leviosa")).toMatchObject({
      title: "Расходиум Левиоса",
      unlocked: true,
      hidden: false,
    })
    expect(unlocked.find((item) => item.id === "secret-not-the-debts")?.unlocked).toBe(false)
  })

  it("unlocks the hidden coffee achievement for the payer", () => {
    const achievement = evaluateAchievements({
      ...emptyMetrics,
      coffeeExpensesPaid: 1,
    }).find((item) => item.id === "secret-coffee-path")

    expect(achievement).toMatchObject({
      title: "Это путь. К кофе",
      unlocked: true,
      hidden: true,
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

describe("isCoffeeExpense", () => {
  it.each([
    "Кофе",
    "Кофейня у дома",
    "Два латте",
    "Капучино для Маши",
    "Эспрессо",
    "Americano",
    "Coffee break",
    "Раф с сиропом",
  ])("recognizes %s as coffee", (title) => {
    expect(isCoffeeExpense(title)).toBe(true)
  })

  it("does not match unrelated words containing the same letters", () => {
    expect(isCoffeeExpense("График платежей")).toBe(false)
    expect(isCoffeeExpense("Ужин в ресторане")).toBe(false)
  })

  it("matches by category too, not only by title", () => {
    expect(isCoffeeExpense("Ужин", "Кофе")).toBe(true)
    expect(isCoffeeExpense("Ужин", "Продукты")).toBe(false)
    expect(isCoffeeExpense("Ужин", null)).toBe(false)
    expect(isCoffeeExpense("Ужин", undefined)).toBe(false)
  })
})

describe("evaluateAchievements — структурные инварианты (спецификация)", () => {
  it("у каждой ачивки заполнены обязательные поля и целевое значение >= 1", () => {
    for (const a of evaluateAchievements(emptyMetrics)) {
      expect(a.id).toBeTruthy()
      expect(typeof a.title).toBe("string")
      expect(a.title.length).toBeGreaterThan(0)
      expect(typeof a.description).toBe("string")
      expect(a.category).toBeTruthy()
      expect(a.icon).toBeTruthy()
      expect(a.target).toBeGreaterThanOrEqual(1)
      expect(a.percent).toBeGreaterThanOrEqual(0)
      expect(a.percent).toBeLessThanOrEqual(100)
      expect(a.progress).toBeGreaterThanOrEqual(0)
    }
  })

  it("идентификаторы ачивок уникальны", () => {
    const ids = evaluateAchievements(emptyMetrics).map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("порог срабатывает точно на целевом значении (граница)", () => {
    const below = evaluateAchievements({ ...emptyMetrics, accountAgeDays: 364 })
    const at = evaluateAchievements({ ...emptyMetrics, accountAgeDays: 365 })
    expect(below.find((a) => a.id === "account-year")?.unlocked).toBe(false)
    expect(at.find((a) => a.id === "account-year")?.unlocked).toBe(true)
  })

  it("persisted-набор держит открытыми несколько ачивок при нулевом прогрессе", () => {
    const result = evaluateAchievements(emptyMetrics, new Set(["first-group", "first-expense"]))
    expect(result.find((a) => a.id === "first-group")?.unlocked).toBe(true)
    expect(result.find((a) => a.id === "first-expense")?.unlocked).toBe(true)
    expect(result.find((a) => a.id === "expenses-10")?.unlocked).toBe(false)
  })

  it("summary: число открытых растёт с прогрессом", () => {
    const none = evaluateAchievements(emptyMetrics).filter((a) => a.unlocked).length
    const some = evaluateAchievements({ ...emptyMetrics, expensesCreated: 10, activeGroups: 1 }).filter(
      (a) => a.unlocked
    ).length
    expect(none).toBe(0)
    expect(some).toBeGreaterThan(0)
  })

  it("отрицательная метрика зажимается в 0 (Math.max(0, …))", () => {
    // Гипотетическая отрицательная метрика не должна давать отрицательный прогресс.
    const a = evaluateAchievements({ ...emptyMetrics, expensesCreated: -5 }).find(
      (item) => item.id === "expenses-10"
    )
    expect(a).toMatchObject({ progress: 0, percent: 0, unlocked: false })
  })
})

describe("ACHIEVEMENT_CATEGORY_LABELS", () => {
  it("задаёт русскую подпись для всех шести категорий", () => {
    expect(ACHIEVEMENT_CATEGORY_LABELS).toEqual({
      START: "Первые шаги",
      ACTIVITY: "Активность",
      TEAM: "Вместе",
      SETTLEMENTS: "Расчёты",
      MASTERY: "Функции",
      GROUPS: "Группы",
    })
  })

  it("каждая категория, используемая ачивками, имеет подпись", () => {
    const usedCategories = new Set(evaluateAchievements(emptyMetrics).map((a) => a.category))
    for (const category of usedCategories) {
      expect(ACHIEVEMENT_CATEGORY_LABELS[category]).toBeTruthy()
    }
  })
})
