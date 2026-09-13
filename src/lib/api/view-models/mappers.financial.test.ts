import { describe, expect, it } from "vitest"
import type {
  BalanceOverviewDto,
  ExpenseDto,
  GroupBalancesDto,
  GroupDto,
  GroupMemberDto,
  RequisitesDto,
  SettlementDto,
} from "@contract/v1"
import {
  mapBalanceOverviewViewModel,
  mapExpensePageViewModel,
  mapGroupBalancesViewModel,
  mapGroupMemberViewModel,
  mapGroupViewModel,
  mapInviteViewModel,
  mapRequisitesViewModel,
  mapSettlementViewModel,
  mapUserNameViewModel,
  mapUserSummaryViewModel,
} from "./mappers"

const timestamp = "2026-09-13T10:00:00.000Z"
const alice = { id: "alice", name: "Alice", avatarUrl: null }
const bob = { id: "bob", name: "Bob", avatarUrl: "https://example.com/bob.png" }

function expenseDto(): ExpenseDto {
  return {
    id: "expense",
    groupId: "group",
    paidById: "alice",
    createdById: "alice",
    title: "Dinner",
    amount: 1,
    currency: "RUB",
    amountBase: 1,
    customRate: null,
    category: null,
    splitType: "EXACT",
    date: timestamp,
    notes: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    paidBy: alice,
    createdBy: alice,
    splits: [],
    settlements: [],
  }
}

describe("financial DTO to view-model compatibility", () => {
  it("maps user projections into new exact-shape objects", () => {
    const summary = { ...alice, email: "must-not-leak@example.com" }
    const name = { id: "alice", name: "Alice", email: "must-not-leak@example.com" }

    expect(mapUserSummaryViewModel(summary)).toEqual(alice)
    expect(mapUserSummaryViewModel(summary)).not.toBe(summary)
    expect(mapUserNameViewModel(name)).toEqual({ id: "alice", name: "Alice" })
  })

  it("normalizes omitted member user requisites to explicit nulls", () => {
    const member: GroupMemberDto = {
      id: "membership",
      groupId: "group",
      userId: "bob",
      role: "MEMBER",
      joinedAt: timestamp,
      isActive: false,
      payeeName: null,
      bankName: null,
      payeeAccount: null,
      user: bob,
    }

    expect(mapGroupMemberViewModel(member)).toEqual({
      ...member,
      user: {
        ...bob,
        payeeName: null,
        bankName: null,
        payeeAccount: null,
      },
    })
  })

  it("normalizes an omitted transport expense count to explicit null", () => {
    const dto: GroupDto = {
      id: "group",
      name: "Trip",
      description: null,
      type: "TRIP",
      currency: "RUB",
      createdById: "alice",
      createdAt: timestamp,
      updatedAt: timestamp,
      members: [],
    }

    expect(mapGroupViewModel(dto)).toEqual({
      id: "group",
      name: "Trip",
      description: null,
      type: "TRIP",
      currency: "RUB",
      createdById: "alice",
      createdAt: timestamp,
      updatedAt: timestamp,
      members: [],
      expenseCount: null,
    })
  })

  it("maps requisites without retaining the DTO object", () => {
    const dto: RequisitesDto = {
      payeeName: "Alice Recipient",
      bankName: null,
      payeeAccount: "Account",
    }
    const result = mapRequisitesViewModel(dto)

    expect(result).toEqual(dto)
    expect(result).not.toBe(dto)
  })

  it("maps expense pages and keeps pagination fields exact", () => {
    const dto = { expenses: [expenseDto()], total: 101, hasNext: true }
    const result = mapExpensePageViewModel(dto)

    expect(result).toEqual(dto)
    expect(result).not.toBe(dto)
    expect(result.expenses).not.toBe(dto.expenses)
    expect(result.expenses[0]).not.toBe(dto.expenses[0])
  })

  it("maps nullable settlement references and nested users", () => {
    const dto: SettlementDto = {
      id: "settlement",
      groupId: null,
      expenseId: null,
      fromUserId: "bob",
      toUserId: "alice",
      amount: 1,
      currency: "RUB",
      amountBase: null,
      date: timestamp,
      notes: null,
      createdAt: timestamp,
      fromUser: bob,
      toUser: alice,
    }
    const result = mapSettlementViewModel(dto)

    expect(result).toEqual(dto)
    expect(result).not.toBe(dto)
    expect(result.fromUser).not.toBe(dto.fromUser)
    expect(result.toUser).not.toBe(dto.toUser)
  })

  it("maps group balances into independent nested arrays", () => {
    const dto: GroupBalancesDto = {
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
    }
    const result = mapGroupBalancesViewModel(dto)

    expect(result).toEqual(dto)
    expect(result.simplified).not.toBe(dto.simplified)
    expect(result.raw).not.toBe(dto.raw)
    expect(result.simplified[0]).not.toBe(dto.simplified[0])
  })

  it("maps balance overview and copies every friend group list", () => {
    const dto: BalanceOverviewDto = {
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
    const result = mapBalanceOverviewViewModel(dto)

    expect(result).toEqual(dto)
    expect(result.totals).not.toBe(dto.totals)
    expect(result.friendBalances).not.toBe(dto.friendBalances)
    expect(result.friendBalances[0].groups).not.toBe(dto.friendBalances[0].groups)
  })

  it("maps both invite membership states", () => {
    for (const isAlreadyMember of [false, true]) {
      expect(mapInviteViewModel({
        groupId: "group",
        groupName: "Trip",
        memberCount: 3,
        isAlreadyMember,
      })).toEqual({
        groupId: "group",
        groupName: "Trip",
        memberCount: 3,
        isAlreadyMember,
      })
    }
  })
})
