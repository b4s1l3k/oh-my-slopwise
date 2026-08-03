import { describe, expect, it } from "vitest"
import { createSettlementSchema } from "./settlement"

const base = {
  groupId: "group",
  toUserId: "recipient",
  amount: 10_000,
  currency: "RUB",
  date: "2026-08-01T12:00:00.000Z",
}

describe("createSettlementSchema", () => {
  it("accepts an integer amount within the database range", () => {
    expect(createSettlementSchema.safeParse(base).success).toBe(true)
  })

  it("сумма ограничена сверху значением 2 000 000 000 (граница)", () => {
    // Ограничение — именно .max(2_000_000_000), а не int32/размер хранилища.
    expect(createSettlementSchema.safeParse({ ...base, amount: 2_000_000_000 }).success).toBe(true)
    expect(createSettlementSchema.safeParse({ ...base, amount: 2_000_000_001 }).success).toBe(false)
    expect(createSettlementSchema.safeParse({ ...base, amount: 2_147_483_648 }).success).toBe(false)
  })

  it("сумма должна быть целым положительным числом", () => {
    expect(createSettlementSchema.safeParse({ ...base, amount: 0 }).success).toBe(false)
    expect(createSettlementSchema.safeParse({ ...base, amount: -1 }).success).toBe(false)
    expect(createSettlementSchema.safeParse({ ...base, amount: 10.5 }).success).toBe(false)
  })

  it("groupId и toUserId обязательны (min 1)", () => {
    expect(createSettlementSchema.safeParse({ ...base, groupId: "" }).success).toBe(false)
    expect(createSettlementSchema.safeParse({ ...base, toUserId: "" }).success).toBe(false)
  })

  it("currency по умолчанию RUB и должна быть длиной 3", () => {
    const { currency, ...noCurrency } = base
    void currency
    const r = createSettlementSchema.safeParse(noCurrency)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.currency).toBe("RUB")
    expect(createSettlementSchema.safeParse({ ...base, currency: "RUBLE" }).success).toBe(false)
    expect(createSettlementSchema.safeParse({ ...base, currency: "RU" }).success).toBe(false)
  })

  it("currency проверяется ТОЛЬКО по длине 3, а не по списку валют", () => {
    // ВАЖНО: в отличие от расходов/групп (z.enum(SUPPORTED_CURRENCIES)), расчёт
    // принимает любую строку из 3 символов. Это осознанное текущее поведение —
    // при переписывании учтите, что "XYZ"/"ABC" здесь валидны.
    expect(createSettlementSchema.safeParse({ ...base, currency: "XYZ" }).success).toBe(true)
    expect(createSettlementSchema.safeParse({ ...base, currency: "abc" }).success).toBe(true)
  })

  it("некорректная дата отклоняется", () => {
    expect(createSettlementSchema.safeParse({ ...base, date: "не дата" }).success).toBe(false)
  })

  it("notes опциональны и ограничены 500 символами", () => {
    expect(createSettlementSchema.safeParse({ ...base, notes: "x".repeat(500) }).success).toBe(true)
    expect(createSettlementSchema.safeParse({ ...base, notes: "x".repeat(501) }).success).toBe(false)
  })
})
