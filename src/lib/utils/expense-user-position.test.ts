import { describe, expect, it } from "vitest"
import { getExpenseUserPosition } from "./expense-user-position"

describe("getExpenseUserPosition", () => {
  it("shows payment when another user recorded the expense for the payer", () => {
    expect(
      getExpenseUserPosition({
        currentUserId: "alice",
        paidById: "alice",
        expenseAmount: 240000,
        shareAmount: undefined,
      })
    ).toEqual({ kind: "PAID", amount: 240000 })
  })

  it("shows payment when the payer is also included in the split", () => {
    expect(
      getExpenseUserPosition({
        currentUserId: "alice",
        paidById: "alice",
        expenseAmount: 240000,
        shareAmount: 120000,
      })
    ).toEqual({ kind: "PAID", amount: 240000 })
  })

  it("shows the user's share as owed when another member paid", () => {
    expect(
      getExpenseUserPosition({
        currentUserId: "bob",
        paidById: "alice",
        expenseAmount: 240000,
        shareAmount: 120000,
      })
    ).toEqual({ kind: "OWES", amount: 120000, cashPaid: 0 })
  })

  it("subtracts a partial cash payment from the amount owed", () => {
    expect(
      getExpenseUserPosition({
        currentUserId: "bob",
        paidById: "alice",
        expenseAmount: 240000,
        shareAmount: 120000,
        cashPaid: 40000,
      })
    ).toEqual({ kind: "OWES", amount: 80000, cashPaid: 40000 })
  })

  it("shows a completed cash settlement", () => {
    expect(
      getExpenseUserPosition({
        currentUserId: "bob",
        paidById: "alice",
        expenseAmount: 240000,
        shareAmount: 120000,
        cashPaid: 120000,
      })
    ).toEqual({ kind: "SETTLED", cashPaid: 120000 })
  })

  it("returns no status for a user unrelated to the expense", () => {
    expect(
      getExpenseUserPosition({
        currentUserId: "carol",
        paidById: "alice",
        expenseAmount: 240000,
      })
    ).toBeNull()
  })

  it("returns null when there is no current user", () => {
    expect(
      getExpenseUserPosition({
        currentUserId: undefined,
        paidById: "alice",
        expenseAmount: 240000,
        shareAmount: 120000,
      })
    ).toBeNull()
  })

  it("CASH_PAID: cash settlement exists but no matching split (legacy/edge data)", () => {
    expect(
      getExpenseUserPosition({
        currentUserId: "bob",
        paidById: "alice",
        expenseAmount: 240000,
        shareAmount: undefined,
        cashPaid: 50000,
      })
    ).toEqual({ kind: "CASH_PAID", cashPaid: 50000 })
  })

  it("SETTLED when cash covers or exceeds the share (remaining clamped at 0)", () => {
    expect(
      getExpenseUserPosition({
        currentUserId: "bob",
        paidById: "alice",
        expenseAmount: 240000,
        shareAmount: 100000,
        cashPaid: 150000,
      })
    ).toEqual({ kind: "SETTLED", cashPaid: 150000 })
  })

  it("null when share fully consumed but there is no cash and no owed remainder", () => {
    expect(
      getExpenseUserPosition({
        currentUserId: "bob",
        paidById: "alice",
        expenseAmount: 240000,
        shareAmount: 0,
        cashPaid: 0,
      })
    ).toBeNull()
  })
})
