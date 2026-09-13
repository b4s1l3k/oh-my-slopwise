import { describe, expect, it } from "vitest"
import type {
  AchievementCollectionResponseDto,
  FeedbackDto,
  ProfileDto,
  ProfileStatisticsDto,
  RegisteredUserDto,
} from "@/lib/api/v1/response-dtos"
import {
  mapAchievementCollectionViewModel,
  mapAchievementUnlockViewModel,
  mapAdminFeedbackViewModel,
  mapFeedbackViewModel,
  mapProfileStatisticsViewModel,
  mapProfileViewModel,
  mapRegisteredUserViewModel,
} from "./mappers"

const timestamp = "2026-09-13T10:00:00.000Z"

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

describe("profile DTO to view-model compatibility", () => {
  it("maps all nullable profile fields into an independent object", () => {
    const dto: ProfileDto = {
      id: "alice",
      name: "Alice",
      email: "alice@example.com",
      avatarUrl: null,
      payeeName: null,
      bankName: null,
      payeeAccount: null,
      createdAt: timestamp,
    }
    const result = mapProfileViewModel(dto)

    expect(result).toEqual(dto)
    expect(result).not.toBe(dto)
  })

  it("maps registered user projection without adding profile-only fields", () => {
    const dto: RegisteredUserDto = {
      id: "alice",
      name: "Alice",
      email: "alice@example.com",
      avatarUrl: null,
    }

    expect(mapRegisteredUserViewModel(dto)).toEqual(dto)
    expect(mapRegisteredUserViewModel(dto)).not.toHaveProperty("createdAt")
    expect(mapRegisteredUserViewModel(dto)).not.toHaveProperty("payeeAccount")
  })

  it("maps public and admin feedback projections exactly", () => {
    const dto: FeedbackDto = {
      id: "feedback",
      userId: "alice",
      message: "Detailed feedback",
      createdAt: timestamp,
      user: { name: "Alice", email: "alice@example.com" },
    }

    expect(mapFeedbackViewModel(dto)).toEqual({
      id: "feedback",
      userId: "alice",
      message: "Detailed feedback",
      createdAt: timestamp,
    })
    expect(mapAdminFeedbackViewModel(dto)).toEqual(dto)
    expect(mapAdminFeedbackViewModel(dto).user).not.toBe(dto.user)
  })

  it("maps achievement collection summary and all achievement fields", () => {
    const dto: AchievementCollectionResponseDto = {
      summary: { unlocked: 1, total: 49 },
      achievements: [{
        id: "secret",
        title: "Secret",
        description: "Description",
        category: "MASTERY",
        icon: "lock",
        unlocked: false,
        progress: 0,
        target: 1,
        percent: 0,
        hidden: true,
      }],
    }
    const result = mapAchievementCollectionViewModel(dto)

    expect(result).toEqual(dto)
    expect(result.summary).not.toBe(dto.summary)
    expect(result.achievements).not.toBe(dto.achievements)
    expect(result.achievements[0]).not.toBe(dto.achievements[0])
  })

  it("maps unlock notification as a four-field projection", () => {
    const dto = {
      id: "first-group",
      title: "First group",
      description: "Description",
      icon: "users",
      category: "START",
      target: 1,
    }

    expect(mapAchievementUnlockViewModel(dto)).toEqual({
      id: "first-group",
      title: "First group",
      description: "Description",
      icon: "users",
    })
  })

  it("maps every statistics scalar without transposition", () => {
    const result = mapProfileStatisticsViewModel(statistics)

    expect(result).toEqual(statistics)
    expect(result).not.toBe(statistics)
    expect(result.money).not.toBe(statistics.money)
    expect(result.money.spent).not.toBe(statistics.money.spent)
    expect(result.money.returned).not.toBe(statistics.money.returned)
  })
})
