import { describe, expect, it } from "vitest"
import { getExpenseUserPosition } from "./expense-user-position"

describe("expense user position boundary matrix", () => {
  it.each([
    [1, 0, { kind: "OWES", amount: 1, cashPaid: 0 }],
    [100, 0, { kind: "OWES", amount: 100, cashPaid: 0 }],
    [100, 99, { kind: "OWES", amount: 1, cashPaid: 99 }],
    [100, 100, { kind: "SETTLED", cashPaid: 100 }],
    [100, 101, { kind: "SETTLED", cashPaid: 101 }],
    [2_000_000_000, 1_999_999_999, { kind: "OWES", amount: 1, cashPaid: 1_999_999_999 }],
  ] as const)(
    "maps share %i and cash %i to the exact position",
    (shareAmount, cashPaid, expected) => {
      expect(getExpenseUserPosition({
        currentUserId: "bob",
        paidById: "alice",
        expenseAmount: 2_000_000_000,
        shareAmount,
        cashPaid,
      })).toEqual(expected)
    }
  )

  it.each([0, 1, 2_000_000_000])("payer precedence reports the full expense amount %i", (expenseAmount) => {
    expect(getExpenseUserPosition({
      currentUserId: "alice",
      paidById: "alice",
      expenseAmount,
      shareAmount: 1,
      cashPaid: 2_000_000_000,
    })).toEqual({ kind: "PAID", amount: expenseAmount })
  })

  it("omitted cash and explicit zero cash are semantically identical", () => {
    const omitted = getExpenseUserPosition({
      currentUserId: "bob",
      paidById: "alice",
      expenseAmount: 100,
      shareAmount: 40,
    })
    const explicit = getExpenseUserPosition({
      currentUserId: "bob",
      paidById: "alice",
      expenseAmount: 100,
      shareAmount: 40,
      cashPaid: 0,
    })

    expect(explicit).toEqual(omitted)
  })

  it("does not confuse an empty current user id with a real participant", () => {
    expect(getExpenseUserPosition({
      currentUserId: "",
      paidById: "",
      expenseAmount: 100,
      shareAmount: 100,
    })).toBeNull()
  })
})
