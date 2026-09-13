import { describe, expect, it } from "vitest"
import type { ActivityDto } from "@contract/v1"
import { toActivityListResponse } from "./response-mappers"

const timestamp = "2026-09-13T10:00:00.000Z"

function mapMetadata(type: ActivityDto["type"], metadata: unknown) {
  return toActivityListResponse([{
    id: "activity",
    groupId: null,
    actorId: "alice",
    type,
    entityType: "entity",
    entityId: "entity-id",
    metadata,
    createdAt: timestamp,
    actor: { id: "alice", name: "Alice" },
  }]).activities[0].metadata
}

describe("activity response metadata allowlist matrix", () => {
  it.each([
    ["EXPENSE_CREATED", { title: "Dinner", amount: 123, currency: "RUB" }],
    ["EXPENSE_DELETED", { title: "Dinner", amount: 123, currency: "RUB" }],
    ["EXPENSE_UPDATED", {
      title: "Dinner",
      amount: 123,
      currency: "RUB",
      changes: ["title", "amount"],
    }],
    ["SETTLEMENT_CREATED", {
      amount: 123,
      currency: "RUB",
      toUserName: "Bob",
      cashFromUserName: "Carol",
    }],
    ["SETTLEMENTS_RESET", { removed: 12 }],
    ["MEMBER_ADDED", { memberName: "Bob", viaInvite: true }],
    ["MEMBER_REMOVED", { memberName: "Bob", selfLeft: false }],
    ["GROUP_UPDATED", { name: "Renamed group" }],
  ] as const)("keeps the exact public fields for %s", (type, expected) => {
    const metadata = {
      title: "Dinner",
      amount: 123,
      currency: "RUB",
      changes: ["title", "amount"],
      toUserName: "Bob",
      cashFromUserName: "Carol",
      removed: 12,
      memberName: "Bob",
      viaInvite: true,
      selfLeft: false,
      name: "Renamed group",
      privateToken: "must-not-leak",
    }

    expect(mapMetadata(type, metadata)).toEqual(expected)
  })

  it.each([
    null,
    undefined,
    "string",
    42,
    true,
    [],
  ])("normalizes non-object metadata %j to an empty object", (metadata) => {
    expect(mapMetadata("EXPENSE_CREATED", metadata)).toEqual({})
  })

  it("drops wrong types, non-finite numbers and non-string change entries", () => {
    expect(mapMetadata("EXPENSE_UPDATED", {
      title: 123,
      amount: Number.POSITIVE_INFINITY,
      currency: false,
      changes: ["title", 1, null, false, "notes"],
    })).toEqual({ changes: ["title", "notes"] })
  })

  it("preserves an explicitly empty changes array", () => {
    expect(mapMetadata("EXPENSE_UPDATED", { changes: [] })).toEqual({ changes: [] })
  })

  it("distinguishes false booleans and zero numbers from absent metadata", () => {
    expect(mapMetadata("MEMBER_ADDED", { viaInvite: false })).toEqual({ viaInvite: false })
    expect(mapMetadata("MEMBER_REMOVED", { selfLeft: false })).toEqual({ selfLeft: false })
    expect(mapMetadata("SETTLEMENTS_RESET", { removed: 0 })).toEqual({ removed: 0 })
  })
})
