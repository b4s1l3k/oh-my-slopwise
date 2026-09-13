import { describe, expect, it } from "vitest"
import {
  toGroupDetailResponse,
  toGroupListResponse,
  toGroupResponse,
} from "./response-mappers"

function groupSource(expenseCount?: number) {
  return {
    id: "group",
    name: "Trip",
    description: null,
    type: "TRIP" as const,
    currency: "RUB",
    createdById: "alice",
    createdAt: "2026-09-13",
    updatedAt: "2026-09-13T13:00:00+03:00",
    members: [{
      id: "membership",
      groupId: "group",
      userId: "bob",
      role: "MEMBER" as const,
      joinedAt: "2026-09-13T10:00:00.000Z",
      isActive: true,
      user: { id: "bob", name: "Bob", avatarUrl: null },
    }],
    ...(expenseCount === undefined ? {} : { _count: { expenses: expenseCount } }),
  }
}

describe("group response mapper boundaries", () => {
  it("normalizes date-only and offset timestamps and omits an absent count", () => {
    const result = toGroupResponse(groupSource()).group

    expect(result.createdAt).toBe("2026-09-13T00:00:00.000Z")
    expect(result.updatedAt).toBe("2026-09-13T10:00:00.000Z")
    expect(result).not.toHaveProperty("_count")
  })

  it("preserves an explicit zero expense count", () => {
    expect(toGroupListResponse([groupSource(0)]).groups[0]._count).toEqual({ expenses: 0 })
  })

  it("keeps omitted user requisites omitted even in an authorized detail response", () => {
    const member = toGroupDetailResponse(groupSource()).group.members[0]

    expect(member).toMatchObject({
      payeeName: null,
      bankName: null,
      payeeAccount: null,
      user: { id: "bob", name: "Bob", avatarUrl: null },
    })
    expect(member.user).not.toHaveProperty("payeeName")
    expect(member.user).not.toHaveProperty("bankName")
    expect(member.user).not.toHaveProperty("payeeAccount")
  })

  it("rejects invalid Date objects from persistence", () => {
    const source = groupSource()
    source.createdAt = new Date(Number.NaN) as unknown as string

    expect(() => toGroupResponse(source)).toThrow("INVALID_RESPONSE_TIMESTAMP")
  })
})
