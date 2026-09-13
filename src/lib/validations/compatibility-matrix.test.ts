import { describe, expect, it } from "vitest"
import { registrationSchema } from "./auth"
import { createExpenseSchema } from "./expense"
import { feedbackSchema } from "./feedback"
import { createGroupSchema, updateGroupSchema } from "./group"
import { createSettlementSchema } from "./settlement"
import { requisitesSchema, updateProfileSchema } from "./user"

const expense = {
  title: "Dinner",
  amount: 10_001,
  currency: "RUB" as const,
  date: "2026-09-13",
  paidById: "alice",
  splitType: "PERCENTAGE" as const,
  splits: [
    { userId: "alice", percentage: 3_333 },
    { userId: "bob", percentage: 6_667 },
  ],
  cashPayments: [{ userId: "bob", amount: 1 }],
}

const settlement = {
  groupId: "group",
  toUserId: "bob",
  amount: 1,
  currency: "RUB",
  date: "2026-09-13",
}

describe("validation unknown-field contract", () => {
  it("strips unknown registration fields", () => {
    const result = registrationSchema.parse({
      email: "alice@example.com",
      name: "Alice",
      password: "password",
      role: "ADMIN",
      id: "injected-id",
    })

    expect(result).toEqual({
      email: "alice@example.com",
      name: "Alice",
      password: "password",
    })
  })

  it("strips unknown group fields while preserving defaults", () => {
    expect(createGroupSchema.parse({ name: "Group", createdById: "attacker" })).toEqual({
      name: "Group",
      type: "OTHER",
      currency: "RUB",
      memberIds: [],
    })
    expect(updateGroupSchema.parse({ name: "Renamed", currency: "USD" })).toEqual({
      name: "Renamed",
    })
  })

  it("strips unknown expense fields at every object level", () => {
    const result = createExpenseSchema.parse({
      ...expense,
      amountBase: 777,
      createdById: "attacker",
      splits: expense.splits.map((split) => ({ ...split, amountBase: 123 })),
      cashPayments: expense.cashPayments.map((payment) => ({ ...payment, currency: "USD" })),
    })

    expect(result).not.toHaveProperty("amountBase")
    expect(result).not.toHaveProperty("createdById")
    expect(result.splits.every((split) => !("amountBase" in split))).toBe(true)
    expect(result.cashPayments?.every((payment) => !("currency" in payment))).toBe(true)
  })

  it("strips unknown settlement, feedback, profile and requisites fields", () => {
    expect(createSettlementSchema.parse({ ...settlement, fromUserId: "attacker" })).not.toHaveProperty(
      "fromUserId"
    )
    expect(feedbackSchema.parse({ message: "0123456789", userId: "attacker" })).toEqual({
      message: "0123456789",
    })
    expect(updateProfileSchema.parse({ name: "Alice", email: "new@example.com" })).toEqual({
      name: "Alice",
    })
    expect(requisitesSchema.parse({ payeeName: "Alice", passwordHash: "secret" })).toEqual({
      payeeName: "Alice",
    })
  })
})

describe("validation Unicode length compatibility", () => {
  it.each([
    ["group name", () => createGroupSchema.safeParse({ name: "😀".repeat(50) }).success, true],
    ["group name over max", () => createGroupSchema.safeParse({ name: "😀".repeat(51) }).success, false],
    ["expense title", () => createExpenseSchema.safeParse({ ...expense, title: "😀".repeat(127) }).success, true],
    ["expense title over max", () => createExpenseSchema.safeParse({ ...expense, title: "😀".repeat(128) }).success, false],
    ["expense notes", () => createExpenseSchema.safeParse({ ...expense, notes: "😀".repeat(500) }).success, true],
    ["expense notes over max", () => createExpenseSchema.safeParse({ ...expense, notes: "😀".repeat(501) }).success, false],
    ["feedback minimum", () => feedbackSchema.safeParse({ message: "😀".repeat(5) }).success, true],
    ["feedback below minimum", () => feedbackSchema.safeParse({ message: "😀".repeat(4) }).success, false],
    ["feedback maximum", () => feedbackSchema.safeParse({ message: "😀".repeat(1_000) }).success, true],
    ["feedback over maximum", () => feedbackSchema.safeParse({ message: "😀".repeat(1_001) }).success, false],
  ] as const)("uses JavaScript UTF-16 code units for %s", (_label, parse, expected) => {
    expect(parse()).toBe(expected)
  })

  it.each([
    ["ASCII 72 bytes", "a".repeat(72), true],
    ["ASCII 73 bytes", "a".repeat(73), false],
    ["Cyrillic 72 bytes", "я".repeat(36), true],
    ["Cyrillic 74 bytes", "я".repeat(37), false],
    ["CJK 72 bytes", "界".repeat(24), true],
    ["CJK 75 bytes", "界".repeat(25), false],
    ["emoji 72 bytes", "😀".repeat(18), true],
    ["emoji 76 bytes", "😀".repeat(19), false],
    ["mixed 72 bytes", `${"a".repeat(68)}😀`, true],
    ["mixed 73 bytes", `${"a".repeat(69)}😀`, false],
  ] as const)("applies bcrypt byte boundary to %s", (_label, password, expected) => {
    expect(registrationSchema.safeParse({
      email: "alice@example.com",
      name: "Alice",
      password,
    }).success).toBe(expected)
  })

  it("applies password minimum to UTF-16 code units before the UTF-8 byte ceiling", () => {
    expect(registrationSchema.safeParse({
      email: "alice@example.com",
      name: "Alice",
      password: "😀".repeat(3),
    }).success).toBe(false)
    expect(registrationSchema.safeParse({
      email: "alice@example.com",
      name: "Alice",
      password: "😀".repeat(4),
    }).success).toBe(true)
  })
})

describe("validation numeric and null boundaries", () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite expense amount %s",
    (amount) => {
      expect(createExpenseSchema.safeParse({ ...expense, amount }).success).toBe(false)
    }
  )

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite custom rate %s",
    (customRate) => {
      expect(createExpenseSchema.safeParse({ ...expense, customRate }).success).toBe(false)
    }
  )

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite settlement amount %s",
    (amount) => {
      expect(createSettlementSchema.safeParse({ ...settlement, amount }).success).toBe(false)
    }
  )

  it.each([
    ["expense category", () => createExpenseSchema.safeParse({ ...expense, category: null }).success],
    ["expense notes", () => createExpenseSchema.safeParse({ ...expense, notes: null }).success],
    ["expense cashPayments", () => createExpenseSchema.safeParse({ ...expense, cashPayments: null }).success],
    ["group description", () => createGroupSchema.safeParse({ name: "Group", description: null }).success],
    ["settlement notes", () => createSettlementSchema.safeParse({ ...settlement, notes: null }).success],
    ["feedback message", () => feedbackSchema.safeParse({ message: null }).success],
  ] as const)("rejects null for optional non-null field %s", (_label, parse) => {
    expect(parse()).toBe(false)
  })

  it.each(["payeeName", "bankName", "payeeAccount"] as const)(
    "accepts explicit null for nullable requisite %s",
    (field) => {
      expect(requisitesSchema.parse({ [field]: null })).toEqual({ [field]: null })
    }
  )
})
