import { describe, it, expect } from "vitest"
import { createExpenseSchema } from "./expense"

const base = {
  title: "Смузи",
  amount: 240000,
  currency: "RUB" as const,
  date: "2026-07-21T12:00:00.000Z",
  paidById: "alice",
  splitType: "EQUAL" as const,
  splits: [{ userId: "alice" }, { userId: "bob" }],
}

function issues(data: unknown) {
  const r = createExpenseSchema.safeParse(data)
  return r.success ? [] : r.error.issues.map((i) => ({ path: i.path.join("."), msg: i.message }))
}

describe("createExpenseSchema — cashPayments", () => {
  it("валидный наличный платёж проходит", () => {
    const r = createExpenseSchema.safeParse({
      ...base,
      cashPayments: [{ userId: "bob", amount: 40000 }],
    })
    expect(r.success).toBe(true)
  })

  it("без cashPayments проходит (поле опционально)", () => {
    expect(createExpenseSchema.safeParse(base).success).toBe(true)
  })

  it("плательщик не может быть в списке наличных", () => {
    const errs = issues({ ...base, cashPayments: [{ userId: "alice", amount: 10000 }] })
    expect(errs.some((e) => e.path === "cashPayments")).toBe(true)
  })

  it("наличный платёж не может быть больше доли участника", () => {
    const errs = issues({ ...base, cashPayments: [{ userId: "bob", amount: 240000 }] })
    expect(errs.some((e) => e.path === "cashPayments.0.amount")).toBe(true)
  })

  it("наличный платёж в пределах доли допустим", () => {
    const r = createExpenseSchema.safeParse({
      ...base,
      cashPayments: [{ userId: "bob", amount: 120000 }],
    })
    expect(r.success).toBe(true)
  })

  it("наличный платёж разрешён только участнику расхода", () => {
    const errs = issues({ ...base, cashPayments: [{ userId: "carol", amount: 10000 }] })
    expect(errs.some((e) => e.path === "cashPayments.0.userId")).toBe(true)
  })

  it("одного участника нельзя указать в наличных дважды", () => {
    const errs = issues({
      ...base,
      cashPayments: [
        { userId: "bob", amount: 10000 },
        { userId: "bob", amount: 10000 },
      ],
    })
    expect(errs.some((e) => e.path === "cashPayments")).toBe(true)
  })

  it("весь расход можно вернуть наличными, если плательщик не участвует в разбивке", () => {
    const r = createExpenseSchema.safeParse({
      ...base,
      splits: [{ userId: "bob" }],
      cashPayments: [{ userId: "bob", amount: base.amount }],
    })
    expect(r.success).toBe(true)
  })

  it("нулевая/отрицательная сумма наличных отклоняется", () => {
    expect(createExpenseSchema.safeParse({ ...base, cashPayments: [{ userId: "bob", amount: 0 }] }).success).toBe(false)
    expect(createExpenseSchema.safeParse({ ...base, cashPayments: [{ userId: "bob", amount: -100 }] }).success).toBe(false)
  })
})
