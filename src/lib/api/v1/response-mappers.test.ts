import { describe, expect, it } from "vitest"
import {
  toActivityListResponse,
  toGroupDetailResponse,
  toGroupListResponse,
  toGroupMemberResponse,
  toGroupResponse,
  toProfileResponse,
  toRegisterUserResponse,
} from "@/lib/api/v1/response-mappers"

describe("v1 response mappers", () => {
  it("owns timestamp serialization and does not expose persistence-only fields", () => {
    const createdAt = new Date("2026-09-13T10:00:00.000Z")
    const persistedUser = {
      id: "user-1",
      name: "Alice",
      email: "alice@example.com",
      avatarUrl: null,
      payeeName: null,
      bankName: null,
      payeeAccount: null,
      createdAt,
      passwordHash: "must-not-leak",
    }

    expect(
      toProfileResponse(persistedUser)
    ).toEqual({
      user: {
        id: "user-1",
        name: "Alice",
        email: "alice@example.com",
        avatarUrl: null,
        payeeName: null,
        bankName: null,
        payeeAccount: null,
        createdAt: "2026-09-13T10:00:00.000Z",
      },
    })
  })

  it("keeps registration output independent from the persisted user shape", () => {
    const persistedUser = {
      id: "user-1",
      email: "alice@example.com",
      name: "Alice",
      avatarUrl: null,
      passwordHash: "must-not-leak",
    }

    expect(
      toRegisterUserResponse(persistedUser)
    ).toEqual({
      user: {
        id: "user-1",
        email: "alice@example.com",
        name: "Alice",
        avatarUrl: null,
      },
    })
  })

  it("allowlists activity metadata instead of exposing arbitrary persisted JSON", () => {
    expect(
      toActivityListResponse([{
        id: "activity-1",
        groupId: "group-1",
        actorId: "user-1",
        type: "EXPENSE_CREATED",
        entityType: "expense",
        entityId: "expense-1",
        metadata: {
          title: "Dinner",
          amount: 10_000,
          currency: "RUB",
          internalDebugValue: "must-not-leak",
        },
        createdAt: "2026-09-13T10:00:00+03:00",
        actor: { id: "user-1", name: "Alice" },
      }])
    ).toEqual({
      activities: [{
        id: "activity-1",
        groupId: "group-1",
        actorId: "user-1",
        type: "EXPENSE_CREATED",
        entityType: "expense",
        entityId: "expense-1",
        metadata: { title: "Dinner", amount: 10_000, currency: "RUB" },
        createdAt: "2026-09-13T07:00:00.000Z",
        actor: { id: "user-1", name: "Alice" },
      }],
    })
  })

  it("rejects a persisted group currency outside the public allowlist", () => {
    expect(() =>
      toGroupResponse({
        id: "group-1",
        name: "Trip",
        description: null,
        type: "TRIP",
        currency: "BTC",
        createdById: "user-1",
        createdAt: new Date("2026-09-13T10:00:00.000Z"),
        updatedAt: new Date("2026-09-13T10:00:00.000Z"),
        members: [],
      })
    ).toThrow("INVALID_RESPONSE_CURRENCY")
  })

  it("redacts member requisites outside the authorized group-detail response", () => {
    const sensitiveMember = {
      id: "membership-1",
      groupId: "group-1",
      userId: "user-2",
      role: "MEMBER" as const,
      joinedAt: new Date("2026-09-13T10:00:00.000Z"),
      isActive: true,
      payeeName: "Bob Recipient",
      bankName: "Secret Bank",
      payeeAccount: "Secret Account",
      user: {
        id: "user-2",
        name: "Bob",
        avatarUrl: null,
        payeeName: "Bob Profile",
        bankName: "Profile Bank",
        payeeAccount: "Profile Account",
      },
    }
    const group = {
      id: "group-1",
      name: "Trip",
      description: null,
      type: "TRIP" as const,
      currency: "RUB",
      createdById: "user-1",
      createdAt: new Date("2026-09-13T10:00:00.000Z"),
      updatedAt: new Date("2026-09-13T10:00:00.000Z"),
      members: [sensitiveMember],
    }

    for (const member of [
      toGroupListResponse([group]).groups[0].members[0],
      toGroupResponse(group).group.members[0],
      toGroupMemberResponse(sensitiveMember).member,
    ]) {
      expect(member).toMatchObject({
        payeeName: null,
        bankName: null,
        payeeAccount: null,
        user: { id: "user-2", name: "Bob", avatarUrl: null },
      })
      expect(member.user).not.toHaveProperty("payeeName")
      expect(member.user).not.toHaveProperty("bankName")
      expect(member.user).not.toHaveProperty("payeeAccount")
    }

    expect(toGroupDetailResponse(group).group.members[0]).toMatchObject({
      payeeName: "Bob Recipient",
      bankName: "Secret Bank",
      payeeAccount: "Secret Account",
      user: {
        payeeName: "Bob Profile",
        bankName: "Profile Bank",
        payeeAccount: "Profile Account",
      },
    })
  })
})
