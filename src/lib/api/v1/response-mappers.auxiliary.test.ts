import { describe, expect, it } from "vitest"
import type { AchievementDto, ProfileStatisticsDto } from "@contract/v1"
import {
  toAcceptInviteResponse,
  toAchievementCollectionResponse,
  toAchievementUnlocksResponse,
  toFeedbackListResponse,
  toFeedbackResponse,
  toInviteInfoResponse,
  toInviteTokenResponse,
  toProfileResponse,
  toProfileStatisticsResponse,
  toRequisitesResponse,
  toResetSettlementsResponse,
  toUserSearchResponse,
} from "./response-mappers"

const statistics: ProfileStatisticsDto = {
  money: {
    spent: [{ currency: "RUB", amount: 1 }],
    returned: [{ currency: "USD", amount: 2 }],
  },
  overview: {
    expensesParticipated: 3,
    expensesCreated: 4,
    expensesPaid: 5,
    activeGroups: 6,
  },
  splits: { equal: 7, exact: 8, percentage: 9 },
  collaboration: {
    uniquePeople: 10,
    settlementsSent: 11,
    settlementsReceived: 12,
    cashSettlements: 13,
    invitesCreated: 14,
    createdForOthers: 15,
  },
  groups: { created: 16, home: 17, trip: 18, couple: 19, other: 20 },
  mastery: { currenciesUsed: 21, splitMethodsUsed: 22, customRates: 23 },
  records: {
    maxExpenseParticipants: 24,
    maxPaidParticipants: 25,
    maxGroupMembers: 26,
    maxGroupExpenses: 27,
    accountAgeDays: 28,
  },
}

const achievement: AchievementDto = {
  id: "first-group",
  title: "First group",
  description: "Create a group",
  category: "START",
  icon: "users",
  unlocked: true,
  progress: 2,
  target: 1,
  percent: 100,
  hidden: false,
}

describe("auxiliary response mapper compatibility", () => {
  it("pins the exact wrapper shapes for scalar operation results", () => {
    expect(toResetSettlementsResponse({ removed: 3 })).toEqual({ removed: 3 })
    expect(toInviteTokenResponse("opaque-token")).toEqual({ token: "opaque-token" })
    expect(toAcceptInviteResponse("group-id")).toEqual({ groupId: "group-id" })
  })

  it("maps invite info and strips additional source properties", () => {
    const source = {
      groupId: "group-id",
      groupName: "Trip",
      memberCount: 4,
      isAlreadyMember: false,
      internalToken: "must-not-leak",
    }

    expect(toInviteInfoResponse(source)).toEqual({
      invite: {
        groupId: "group-id",
        groupName: "Trip",
        memberCount: 4,
        isAlreadyMember: false,
      },
    })
  })

  it("maps nullable requisites without exposing additional profile fields", () => {
    const source = {
      payeeName: "Alice Recipient",
      bankName: null,
      payeeAccount: "Account",
      email: "must-not-leak@example.com",
    }

    expect(toRequisitesResponse(source)).toEqual({
      requisites: {
        payeeName: "Alice Recipient",
        bankName: null,
        payeeAccount: "Account",
      },
    })
  })

  it("maps feedback with and without its optional user projection", () => {
    const base = {
      id: "feedback",
      userId: "alice",
      message: "Detailed feedback",
      createdAt: "2026-09-13T13:00:00+03:00",
    }
    const plain = {
      id: "feedback",
      userId: "alice",
      message: "Detailed feedback",
      createdAt: "2026-09-13T10:00:00.000Z",
    }
    const withUser = {
      ...base,
      user: { name: "Alice", email: "alice@example.com", passwordHash: "must-not-leak" },
    }

    expect(toFeedbackResponse(base)).toEqual({ feedback: plain })
    expect(toFeedbackListResponse([base, withUser])).toEqual({
      feedbacks: [
        plain,
        { ...plain, user: { name: "Alice", email: "alice@example.com" } },
      ],
    })
  })

  it("maps user search summaries and excludes email and requisites", () => {
    const source = {
      id: "alice",
      name: "Alice",
      avatarUrl: null,
      email: "must-not-leak@example.com",
      payeeAccount: "must-not-leak",
    }

    expect(toUserSearchResponse([source])).toEqual({
      users: [{ id: "alice", name: "Alice", avatarUrl: null }],
    })
    expect(toUserSearchResponse([])).toEqual({ users: [] })
  })

  it("represents a missing profile explicitly as null", () => {
    expect(toProfileResponse(null)).toEqual({ user: null })
  })

  it.each(["invalid", "2026-02-30", "", "Infinity"])(
    "rejects invalid response timestamp %j",
    (createdAt) => {
      expect(() => toProfileResponse({
        id: "alice",
        name: "Alice",
        email: "alice@example.com",
        avatarUrl: null,
        payeeName: null,
        bankName: null,
        payeeAccount: null,
        createdAt,
      })).toThrow("INVALID_RESPONSE_TIMESTAMP")
    }
  )

  it("maps achievement collections and unlock notifications through independent objects", () => {
    const collection = toAchievementCollectionResponse({
      summary: { unlocked: 1, total: 49 },
      achievements: [achievement],
    })
    const unlocks = toAchievementUnlocksResponse([achievement])

    expect(collection).toEqual({
      summary: { unlocked: 1, total: 49 },
      achievements: [achievement],
    })
    expect(collection.achievements[0]).not.toBe(achievement)
    expect(unlocks).toEqual({
      unlocked: [{
        id: "first-group",
        title: "First group",
        description: "Create a group",
        icon: "users",
      }],
    })
  })

  it("maps every statistics field without combining money currencies", () => {
    const result = toProfileStatisticsResponse(statistics)

    expect(result).toEqual({ statistics })
    expect(result.statistics).not.toBe(statistics)
    expect(result.statistics.money.spent).not.toBe(statistics.money.spent)
    expect(result.statistics.money.returned).not.toBe(statistics.money.returned)
  })
})
