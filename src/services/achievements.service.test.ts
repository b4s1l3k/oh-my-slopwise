import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "@/lib/db"
import { createGroup } from "@/services/groups.service"
import { createExpense } from "@/services/expenses.service"
import {
  getUserAchievements,
  collectUnseenAchievementUnlocks,
} from "@/services/achievements.service"

// DB-backed spec for the achievements service. Gated like the other DB specs.
const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === "true"
const describeDatabase = runDatabaseTests ? describe : describe.skip
const testPrefix = `svc-ach-${Date.now()}`

async function mkUser(tag: string) {
  return prisma.user.create({
    data: { email: `${testPrefix}-${tag}@t.io`, name: tag, passwordHash: "x" },
  })
}

describeDatabase("achievements.service (DB-backed behavioral spec)", () => {
  afterAll(async () => {
    await prisma.group.deleteMany({ where: { createdBy: { email: { startsWith: testPrefix } } } })
    await prisma.userAchievement.deleteMany({ where: { user: { email: { startsWith: testPrefix } } } })
    await prisma.userStatisticFact.deleteMany({ where: { user: { email: { startsWith: testPrefix } } } })
    await prisma.user.deleteMany({ where: { email: { startsWith: testPrefix } } })
    await prisma.$disconnect()
  })

  it("getUserAchievements returns a summary and the full list, persisting new unlocks", async () => {
    const a = await mkUser("a")
    await createGroup(a.id, { name: `${testPrefix}-g`, type: "TRIP", currency: "RUB", memberIds: [] } as never)

    const result = await getUserAchievements(a.id)
    expect(result.summary.total).toBeGreaterThan(60)
    expect(result.summary.unlocked).toBeGreaterThan(0) // first-group + trip-group at least
    expect(result.achievements.find((x) => x.id === "first-group")?.unlocked).toBe(true)

    // Persisted with notifiedAt = null (not yet shown).
    const persisted = await prisma.userAchievement.findMany({ where: { userId: a.id } })
    expect(persisted.length).toBe(result.summary.unlocked)
    expect(persisted.some((r) => r.achievementId === "first-group")).toBe(true)
  })

  it("collectUnseenAchievementUnlocks returns each unlock once, then nothing", async () => {
    const a = await mkUser("b")
    const b = await mkUser("b2")
    const g = await createGroup(a.id, { name: `${testPrefix}-g2`, type: "TRIP", currency: "RUB", memberIds: [b.id] } as never)
    await createExpense(g.id, a.id, {
      title: "dinner",
      amount: 10000,
      currency: "RUB",
      date: new Date(Date.UTC(2027, 0, 1)).toISOString(),
      paidById: a.id,
      splitType: "EQUAL",
      splits: [{ userId: a.id }, { userId: b.id }],
    } as never)

    const first = await collectUnseenAchievementUnlocks(a.id)
    expect(first.length).toBeGreaterThan(0)
    expect(first.some((x) => x.id === "first-expense")).toBe(true)
    // Each notification carries the display fields.
    for (const n of first) {
      expect(n.id).toBeTruthy()
      expect(n.title).toBeTruthy()
      expect(n.description).toBeTruthy()
      expect(n.icon).toBeTruthy()
    }

    // Second call: nothing new (all marked notified).
    const second = await collectUnseenAchievementUnlocks(a.id)
    expect(second).toEqual([])

    // No NULL notifiedAt rows remain for this user.
    const stillUnseen = await prisma.userAchievement.count({
      where: { userId: a.id, notifiedAt: null },
    })
    expect(stillUnseen).toBe(0)
  })

  it("открытая СКРЫТАЯ ачивка приходит с настоящими названием и иконкой (без маски)", async () => {
    const a = await mkUser("c")
    const b = await mkUser("c2")
    const g = await createGroup(a.id, { name: `${testPrefix}-g3`, type: "TRIP", currency: "RUB", memberIds: [b.id] } as never)
    // «Кофе» в названии → записывается факт COFFEE_PAID → открывается СКРЫТАЯ
    // ачивка secret-coffee-path (target 1). Это единственная скрытая ачивка,
    // которую практично открыть в тесте, и именно она проверяет снятие маски.
    await createExpense(g.id, a.id, {
      title: "Кофе",
      amount: 10000,
      currency: "RUB",
      date: new Date(Date.UTC(2027, 0, 1)).toISOString(),
      paidById: a.id,
      splitType: "EQUAL",
      splits: [{ userId: a.id }, { userId: b.id }],
    } as never)

    const unseen = await collectUnseenAchievementUnlocks(a.id)

    // Скрытая ачивка действительно открылась и пришла в уведомлениях…
    const coffee = unseen.find((n) => n.id === "secret-coffee-path")
    expect(coffee).toBeDefined()
    // …причём с настоящим названием/иконкой, а не с маской "Секретная ачивка"/"lock".
    expect(coffee!.title).toBe("Это путь. К кофе")
    expect(coffee!.icon).not.toBe("lock")
    expect(coffee!.icon).toBeTruthy()

    // И ни одно уведомление в принципе не должно нести маску-заглушку.
    expect(unseen.every((n) => n.title !== "Секретная ачивка" && n.icon !== "lock")).toBe(true)
  })
})
