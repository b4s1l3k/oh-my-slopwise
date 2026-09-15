import { describe, expect, it } from "vitest"
import {
  toBalanceOverviewResponse,
  toExpensePageResponse,
  toExpenseResponse,
  toGroupBalancesResponse,
  toSettlementListResponse,
  toSettlementResponse,
} from "./response-mappers"

const instant = new Date("2026-09-13T10:00:00.123Z")
const alice = { id: "alice", name: "Alice", avatarUrl: null }
const bob = { id: "bob", name: "Bob", avatarUrl: "https://example.com/bob.png" }

function expenseSource() {
  return {
    id: "expense",
    groupId: "group",
    paidById: "alice",
    createdById: "bob",
    title: "Dinner",
    amount: 10_001,
    currency: "USD",
    amountBase: 900_090,
    customRate: 90 as number | null,
    category: "Food",
    splitType: "PERCENTAGE" as const,
    date: instant,
    notes: "Tip included",
    createdAt: instant,
    updatedAt: "2026-09-13T13:00:00+03:00",
    paidBy: { ...alice, email: "must-not-leak@example.com" },
    createdBy: { ...bob, email: "must-not-leak@example.com" },
    splits: [{
      id: "split",
      expenseId: "expense",
      userId: "bob",
      amount: 3_334,
      amountBase: 300_060,
      percentage: 3_333,
      user: { ...bob, email: "must-not-leak@example.com" },
      persistenceOnly: true,
    }],
    settlements: [{
      id: "cash",
      amount: 100,
      currency: "USD",
      amountBase: 9_000,
      fromUser: { id: "bob", name: "Bob", avatarUrl: bob.avatarUrl },
      persistenceOnly: true,
    }],
    persistenceOnly: true,
  }
}

function settlementSource() {
  return {
    id: "settlement",
    groupId: "group",
    expenseId: "expense",
    fromUserId: "bob",
    toUserId: "alice",
    amount: 1,
    currency: "JPY",
    amountBase: 90,
    date: "2026-09-13T13:00:00+03:00",
    notes: null,
    createdAt: instant,
    fromUser: bob,
    toUser: alice,
    persistenceOnly: "must-not-leak",
  }
}

describe("financial response mapper compatibility", () => {
  it("maps the complete expense projection with exact nested shapes", () => {
    expect(toExpenseResponse(expenseSource())).toEqual({
      expense: {
        id: "expense",
        groupId: "group",
        paidById: "alice",
        createdById: "bob",
        title: "Dinner",
        amount: 10_001,
        currency: "USD",
        amountBase: 900_090,
        customRate: 90,
        category: "Food",
        splitType: "PERCENTAGE",
        date: "2026-09-13T10:00:00.123Z",
        notes: "Tip included",
        createdAt: "2026-09-13T10:00:00.123Z",
        updatedAt: "2026-09-13T10:00:00.000Z",
        paidBy: alice,
        createdBy: bob,
        splits: [{
          id: "split",
          expenseId: "expense",
          userId: "bob",
          amount: 3_334,
          amountBase: 300_060,
          percentage: 3_333,
          user: bob,
        }],
        settlements: [{
          id: "cash",
          amount: 100,
          currency: "USD",
          amountBase: 9_000,
          fromUser: { id: "bob", name: "Bob" },
        }],
      },
    })
  })

  it("maps expense pages without sharing mutable arrays", () => {
    const source = { expenses: [expenseSource()], nextCursor: "opaque-cursor" }
    const result = toExpensePageResponse(source)

    expect(result).toEqual({
      expenses: [toExpenseResponse(source.expenses[0]).expense],
      nextCursor: "opaque-cursor",
    })
    expect(result.expenses).not.toBe(source.expenses)
    expect(result.expenses[0].splits).not.toBe(source.expenses[0].splits)
    expect(result.expenses[0].settlements).not.toBe(source.expenses[0].settlements)
  })

  it("preserves nullable custom rates and empty expense collections", () => {
    const source = expenseSource()
    source.customRate = null

    expect(toExpenseResponse(source).expense).toMatchObject({
      amountBase: 900_090,
      customRate: null,
      splits: [{ amountBase: 300_060 }],
      settlements: [{ amountBase: 9_000 }],
    })
    expect(toExpensePageResponse({ expenses: [], nextCursor: null })).toEqual({
      expenses: [],
      nextCursor: null,
    })
  })

  it("maps raw and simplified balances exactly and strips extra fields", () => {
    const source = {
      simplified: [{
        fromUserId: "bob",
        fromUserName: "Bob",
        toUserId: "alice",
        toUserName: "Alice",
        amount: 1,
        internal: true,
      }],
      raw: [
        { userId: "alice", userName: "Alice", balance: 1, internal: true },
        { userId: "bob", userName: "Bob", balance: -1, internal: true },
      ],
    }

    expect(toGroupBalancesResponse(source)).toEqual({
      balances: {
        simplified: [{
          fromUserId: "bob",
          fromUserName: "Bob",
          toUserId: "alice",
          toUserName: "Alice",
          amount: 1,
        }],
        raw: [
          { userId: "alice", userName: "Alice", balance: 1 },
          { userId: "bob", userName: "Bob", balance: -1 },
        ],
      },
    })
  })

  it("maps balance overview and copies nested group arrays", () => {
    const source = {
      totals: [{ currency: "RUB", owed: 100, owe: 20 }],
      friendBalances: [{
        userId: "bob",
        userName: "Bob",
        avatarUrl: null,
        balance: -20,
        currency: "RUB",
        groups: ["Home", "Trip"],
      }],
    }
    const result = toBalanceOverviewResponse(source)

    expect(result).toEqual(source)
    expect(result).not.toBe(source)
    expect(result.totals).not.toBe(source.totals)
    expect(result.friendBalances).not.toBe(source.friendBalances)
    expect(result.friendBalances[0].groups).not.toBe(source.friendBalances[0].groups)
  })

  it("maps one settlement and a settlement list with normalized timestamps", () => {
    const source = settlementSource()
    const expected = {
      id: "settlement",
      groupId: "group",
      expenseId: "expense",
      fromUserId: "bob",
      toUserId: "alice",
      amount: 1,
      currency: "JPY",
      amountBase: 90,
      date: "2026-09-13T10:00:00.000Z",
      notes: null,
      createdAt: "2026-09-13T10:00:00.123Z",
      fromUser: bob,
      toUser: alice,
    }

    expect(toSettlementResponse(source)).toEqual({ settlement: expected })
    expect(toSettlementListResponse({ settlements: [source], nextCursor: "opaque" })).toEqual({
      settlements: [expected],
      nextCursor: "opaque",
    })
    expect(toSettlementListResponse({ settlements: [], nextCursor: null })).toEqual({
      settlements: [],
      nextCursor: null,
    })
  })
})
