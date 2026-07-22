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

  it("сумма наличных не может быть >= суммы расхода", () => {
    const errs = issues({ ...base, cashPayments: [{ userId: "bob", amount: 240000 }] })
    expect(errs.some((e) => e.path === "cashPayments")).toBe(true)
  })

  it("сумма наличных чуть меньше расхода — допустимо", () => {
    const r = createExpenseSchema.safeParse({
      ...base,
      cashPayments: [{ userId: "bob", amount: 239999 }],
    })
    expect(r.success).toBe(true)
  })

  it("нулевая/отрицательная сумма наличных отклоняется", () => {
    expect(createExpenseSchema.safeParse({ ...base, cashPayments: [{ userId: "bob", amount: 0 }] }).success).toBe(false)
    expect(createExpenseSchema.safeParse({ ...base, cashPayments: [{ userId: "bob", amount: -100 }] }).success).toBe(false)
  })
})
