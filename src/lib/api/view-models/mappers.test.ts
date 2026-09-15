import { describe, expect, it } from "vitest"
import type {
  ActivityDto,
  ExpenseDto,
  FeedbackDto,
  GroupDto,
} from "@contract/v1"
import {
  mapActivityItemViewModel,
  mapAdminFeedbackViewModel,
  mapExpenseViewModel,
  mapGroupViewModel,
} from "@/lib/api/view-models/mappers"

const timestamp = "2026-09-13T10:00:00.000Z"
const user = { id: "user-1", name: "Alice", avatarUrl: null }

function groupDto(): GroupDto {
  return {
    id: "group-1",
    name: "Trip",
    description: null,
    type: "TRIP",
    currency: "RUB",
    createdById: "user-1",
    createdAt: timestamp,
    updatedAt: timestamp,
    members: [{
      id: "member-1",
      groupId: "group-1",
      userId: "user-1",
      role: "ADMIN",
      joinedAt: timestamp,
      isActive: true,
      payeeName: null,
      bankName: null,
      payeeAccount: null,
      user,
    }],
    _count: { expenses: 3 },
  }
}

function expenseDto(): ExpenseDto {
  return {
    id: "expense-1",
    groupId: "group-1",
    paidById: "user-1",
    createdById: "user-1",
    title: "Dinner",
    amount: 1_000,
    currency: "RUB",
    amountBase: 1_000,
    customRate: null,
    category: null,
    splitType: "EQUAL",
    date: timestamp,
    notes: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    paidBy: user,
    createdBy: user,
    splits: [{
      id: "split-1",
      expenseId: "expense-1",
      userId: "user-1",
      amount: 1_000,
      amountBase: 1_000,
      percentage: null,
      user,
    }],
    settlements: [{
      id: "settlement-1",
      amount: 500,
      currency: "RUB",
      amountBase: 500,
      fromUser: { id: "user-2", name: "Bob" },
    }],
  }
}

describe("transport DTO to view-model mappers", () => {
  it("maps a group without leaking transport-only fields", () => {
    const dto = { ...groupDto(), persistenceOnly: "must not leak" }

    const result = mapGroupViewModel(dto)

    expect(result.expenseCount).toBe(3)
    expect(result).not.toHaveProperty("_count")
    expect(result).not.toHaveProperty("persistenceOnly")
    expect(result.members[0].user).toEqual({
      ...user,
      payeeName: null,
      bankName: null,
      payeeAccount: null,
    })
    expect(result.members).not.toBe(dto.members)
  })

  it("creates independent nested expense models", () => {
    const dto = expenseDto()

    const result = mapExpenseViewModel(dto)

    expect(result).toEqual(dto)
    expect(result).not.toBe(dto)
    expect(result.splits).not.toBe(dto.splits)
    expect(result.splits[0].user).not.toBe(dto.splits[0].user)
    expect(result.settlements).not.toBe(dto.settlements)
  })

  it("normalizes untrusted activity metadata at the mapping boundary", () => {
    const dto: ActivityDto = {
      id: "activity-1",
      groupId: "group-1",
      actorId: "user-1",
      type: "EXPENSE_UPDATED",
      entityType: "expense",
      entityId: "expense-1",
      metadata: {
        title: "Dinner",
        amount: "not-a-number",
        changes: ["amount", 42],
      },
      createdAt: timestamp,
      actor: { id: "user-1", name: "Alice" },
    }

    const result = mapActivityItemViewModel(dto)

    expect(result.metadata.title).toBe("Dinner")
    expect(result.metadata.amount).toBeUndefined()
    expect(result.metadata.changes).toEqual(["amount"])
  })

  it("rejects an incomplete admin feedback projection", () => {
    const dto: FeedbackDto = {
      id: "feedback-1",
      userId: "user-1",
      message: "Hello",
      createdAt: timestamp,
    }

    expect(() => mapAdminFeedbackViewModel(dto)).toThrow(
      "Admin feedback response is missing its user"
    )
  })
})
