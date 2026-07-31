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
})
