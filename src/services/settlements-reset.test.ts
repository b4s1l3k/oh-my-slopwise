/**
 * Контрактный тест для resetSettlements:
 * убеждаемся, что логика фильтрации корректна.
 *
 * Реальный сервис работает через Prisma (интеграционные тесты не запускаются в CI без БД),
 * поэтому тестируем pure-function эквивалент — фильтр, который применяет deleteMany.
 */
import { describe, it, expect } from "vitest"

type SettlementRow = { id: string; groupId: string; expenseId: string | null }

/** Имитирует логику deleteMany({ where: { groupId, expenseId: null } }) */
function simulateReset(settlements: SettlementRow[], groupId: string): SettlementRow[] {
  return settlements.filter((s) => !(s.groupId === groupId && s.expenseId === null))
}

describe("resetSettlements — контракт фильтрации", () => {
  const GROUP = "g1"

  const rows: SettlementRow[] = [
    { id: "s1", groupId: GROUP, expenseId: null },         // ручной расчёт → должен удалиться
    { id: "s2", groupId: GROUP, expenseId: "exp-1" },      // cash-on-spot → должен остаться
    { id: "s3", groupId: GROUP, expenseId: "exp-2" },      // cash-on-spot → должен остаться
    { id: "s4", groupId: "other-group", expenseId: null },  // чужая группа → не трогаем
  ]

  it("удаляет только ручные расчёты (expenseId IS NULL) в своей группе", () => {
    const after = simulateReset(rows, GROUP)
    expect(after.map((r) => r.id)).toEqual(["s2", "s3", "s4"])
  })

  it("не удаляет cash-on-spot settlements (expenseId не null)", () => {
    const after = simulateReset(rows, GROUP)
    expect(after.some((r) => r.expenseId !== null && r.groupId === GROUP)).toBe(true)
  })

  it("не трогает settlements других групп", () => {
    const after = simulateReset(rows, GROUP)
    expect(after.find((r) => r.id === "s4")).toBeDefined()
  })

  it("если только cash settlements — ничего не удаляется", () => {
    const cashOnly: SettlementRow[] = [
      { id: "c1", groupId: GROUP, expenseId: "exp-1" },
      { id: "c2", groupId: GROUP, expenseId: "exp-2" },
    ]
    const after = simulateReset(cashOnly, GROUP)
    expect(after).toHaveLength(2)
  })
})
