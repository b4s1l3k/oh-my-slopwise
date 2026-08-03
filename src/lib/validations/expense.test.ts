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
    // path такой же, как у дубликата → пиним ИМЕННО это сообщение, чтобы отличать правила
    expect(
      errs.some(
        (e) => e.path === "cashPayments" && e.msg === "Плательщик расхода не может быть в списке наличных платежей"
      )
    ).toBe(true)
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
    expect(
      errs.some(
        (e) => e.path === "cashPayments" && e.msg === "Наличный платёж участника указан более одного раза"
      )
    ).toBe(true)
  })

  it("нецелая сумма наличных отклоняется", () => {
    expect(
      createExpenseSchema.safeParse({ ...base, cashPayments: [{ userId: "bob", amount: 100.5 }] }).success
    ).toBe(false)
  })

  it("пустой массив cashPayments допустим", () => {
    expect(createExpenseSchema.safeParse({ ...base, cashPayments: [] }).success).toBe(true)
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

describe("createExpenseSchema — базовые поля", () => {
  it("минимально валидный расход проходит, currency по умолчанию RUB", () => {
    const { currency, ...noCurrency } = base
    void currency
    const r = createExpenseSchema.safeParse(noCurrency)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.currency).toBe("RUB")
  })

  it("пустое название отклоняется", () => {
    expect(issues({ ...base, title: "" }).some((e) => e.path === "title")).toBe(true)
  })

  it("название длиннее 255 символов отклоняется", () => {
    expect(createExpenseSchema.safeParse({ ...base, title: "x".repeat(256) }).success).toBe(false)
    expect(createExpenseSchema.safeParse({ ...base, title: "x".repeat(255) }).success).toBe(true)
  })

  it("сумма должна быть целым положительным числом", () => {
    expect(createExpenseSchema.safeParse({ ...base, amount: 0 }).success).toBe(false)
    expect(createExpenseSchema.safeParse({ ...base, amount: -1 }).success).toBe(false)
    expect(createExpenseSchema.safeParse({ ...base, amount: 100.5 }).success).toBe(false)
  })

  it("сумма ограничена сверху (2 000 000 000)", () => {
    expect(createExpenseSchema.safeParse({ ...base, amount: 2_000_000_000 }).success).toBe(true)
    expect(createExpenseSchema.safeParse({ ...base, amount: 2_000_000_001 }).success).toBe(false)
  })

  it("неизвестная валюта отклоняется", () => {
    expect(createExpenseSchema.safeParse({ ...base, currency: "XXX" }).success).toBe(false)
  })

  it("customRate: положительный, не больше 1 000 000, опционален", () => {
    expect(createExpenseSchema.safeParse({ ...base, customRate: 90.5 }).success).toBe(true)
    expect(createExpenseSchema.safeParse({ ...base, customRate: 0 }).success).toBe(false)
    expect(createExpenseSchema.safeParse({ ...base, customRate: -1 }).success).toBe(false)
    // граница: ровно 1 000 000 допустимо, 1 000 001 — нет
    expect(createExpenseSchema.safeParse({ ...base, customRate: 1_000_000 }).success).toBe(true)
    expect(createExpenseSchema.safeParse({ ...base, customRate: 1_000_001 }).success).toBe(false)
  })

  it("splitType обязателен (нет значения по умолчанию)", () => {
    const { splitType, ...noSplitType } = base
    void splitType
    expect(createExpenseSchema.safeParse(noSplitType).success).toBe(false)
  })

  it("некорректная дата отклоняется", () => {
    expect(issues({ ...base, date: "не дата" }).some((e) => e.path === "date")).toBe(true)
  })

  it("нужен хотя бы один участник", () => {
    expect(issues({ ...base, splits: [] }).some((e) => e.path === "splits")).toBe(true)
  })

  it("дубликат участника в splits отклоняется", () => {
    const errs = issues({ ...base, splits: [{ userId: "alice" }, { userId: "alice" }] })
    expect(errs.some((e) => e.path === "splits")).toBe(true)
  })

  it("неизвестный splitType отклоняется", () => {
    expect(createExpenseSchema.safeParse({ ...base, splitType: "SHARES" }).success).toBe(false)
  })

  it("notes длиннее 1000 отклоняется", () => {
    expect(createExpenseSchema.safeParse({ ...base, notes: "x".repeat(1001) }).success).toBe(false)
    expect(createExpenseSchema.safeParse({ ...base, notes: "x".repeat(1000) }).success).toBe(true)
  })
})

describe("createExpenseSchema — EXACT", () => {
  const exact = (splits: { userId: string; amount: number }[]) => ({
    ...base,
    splitType: "EXACT" as const,
    splits,
  })

  it("суммы долей равны сумме расхода → ок", () => {
    const r = createExpenseSchema.safeParse(
      exact([{ userId: "alice", amount: 100000 }, { userId: "bob", amount: 140000 }])
    )
    expect(r.success).toBe(true)
  })

  it("суммы долей не сходятся → ошибка на splits", () => {
    const errs = issues(exact([{ userId: "alice", amount: 100000 }, { userId: "bob", amount: 100000 }]))
    expect(errs.some((e) => e.path === "splits")).toBe(true)
  })

  it("доля должна быть больше 0", () => {
    const errs = issues(exact([{ userId: "alice", amount: 0 }, { userId: "bob", amount: 240000 }]))
    expect(errs.some((e) => e.path.startsWith("splits.0"))).toBe(true)
  })

  it("отсутствующая доля (undefined amount) → ошибка", () => {
    const errs = issues({
      ...base,
      splitType: "EXACT",
      splits: [{ userId: "alice" }, { userId: "bob", amount: 240000 }],
    })
    expect(errs.some((e) => e.path.startsWith("splits.0"))).toBe(true)
  })
})

describe("createExpenseSchema — PERCENTAGE", () => {
  const pct = (splits: { userId: string; percentage: number }[]) => ({
    ...base,
    splitType: "PERCENTAGE" as const,
    splits,
  })

  it("сумма процентов ровно 100% (10000) → ок", () => {
    const r = createExpenseSchema.safeParse(
      pct([{ userId: "alice", percentage: 3000 }, { userId: "bob", percentage: 7000 }])
    )
    expect(r.success).toBe(true)
  })

  it("сумма процентов не 100% → ошибка на splits", () => {
    const errs = issues(pct([{ userId: "alice", percentage: 3000 }, { userId: "bob", percentage: 6000 }]))
    expect(errs.some((e) => e.path === "splits")).toBe(true)
  })

  it("процент должен быть больше 0", () => {
    const errs = issues(pct([{ userId: "alice", percentage: 0 }, { userId: "bob", percentage: 10000 }]))
    expect(errs.some((e) => e.path.startsWith("splits.0"))).toBe(true)
  })

  it("отсутствующий процент (undefined) → ошибка", () => {
    const errs = issues({
      ...base,
      splitType: "PERCENTAGE",
      splits: [{ userId: "alice" }, { userId: "bob", percentage: 10000 }],
    })
    expect(errs.some((e) => e.path.startsWith("splits.0"))).toBe(true)
  })
})
