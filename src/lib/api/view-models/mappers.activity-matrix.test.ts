import { describe, expect, it } from "vitest"
import type { ActivityDto } from "@/lib/api/v1/response-dtos"
import { mapActivityItemViewModel } from "./mappers"

const base: Omit<ActivityDto, "metadata"> = {
  id: "activity",
  groupId: null,
  actorId: "alice",
  type: "SETTLEMENT_CREATED",
  entityType: "settlement",
  entityId: "settlement-id",
  createdAt: "2026-09-13T10:00:00.000Z",
  actor: { id: "alice", name: "Alice" },
}

describe("activity DTO to view-model metadata matrix", () => {
  it("maps every recognized metadata field", () => {
    const metadata = {
      title: "Dinner",
      amount: 123,
      currency: "RUB",
      toUserName: "Bob",
      cashFromUserName: "Carol",
      memberName: "Dave",
      selfLeft: false,
      viaInvite: true,
      name: "Trip",
      changes: ["title", "amount"],
      removed: 0,
      internal: "must-not-leak",
    }

    expect(mapActivityItemViewModel({ ...base, metadata }).metadata).toEqual({
      title: "Dinner",
      amount: 123,
      currency: "RUB",
      toUserName: "Bob",
      cashFromUserName: "Carol",
      memberName: "Dave",
      selfLeft: false,
      viaInvite: true,
      name: "Trip",
      changes: ["title", "amount"],
      removed: 0,
    })
  })

  it("maps every wrong metadata type to undefined", () => {
    const result = mapActivityItemViewModel({
      ...base,
      metadata: {
        title: 1,
        amount: "123",
        currency: false,
        toUserName: null,
        cashFromUserName: [],
        memberName: {},
        selfLeft: 0,
        viaInvite: "true",
        name: 2,
        changes: "title",
        removed: "0",
      },
    })

    expect(result.metadata).toEqual({
      title: undefined,
      amount: undefined,
      currency: undefined,
      toUserName: undefined,
      cashFromUserName: undefined,
      memberName: undefined,
      selfLeft: undefined,
      viaInvite: undefined,
      name: undefined,
      changes: undefined,
      removed: undefined,
    })
  })

  it("filters change entries while preserving order and duplicates", () => {
    const result = mapActivityItemViewModel({
      ...base,
      metadata: { changes: ["amount", 1, "title", "amount", null] },
    })

    expect(result.metadata.changes).toEqual(["amount", "title", "amount"])
  })

  it("does not retain DTO, actor, metadata or changes references", () => {
    const dto: ActivityDto = {
      ...base,
      metadata: { changes: ["amount"] },
    }
    const result = mapActivityItemViewModel(dto)

    expect(result).not.toBe(dto)
    expect(result.actor).not.toBe(dto.actor)
    expect(result.metadata).not.toBe(dto.metadata)
    expect(result.metadata.changes).not.toBe(dto.metadata.changes)
  })
})
