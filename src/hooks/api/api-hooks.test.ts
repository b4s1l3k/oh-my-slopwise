import { beforeEach, describe, expect, it, vi } from "vitest"
import type { QueryClient } from "@tanstack/react-query"

const apiMocks = vi.hoisted(() => ({
  getGroups: vi.fn(),
  getActivity: vi.fn(),
  getGroupExpenses: vi.fn(),
  searchUsers: vi.fn(),
}))

vi.mock("@/lib/api/client/groups-api", () => ({
  groupsApi: {
    getGroups: apiMocks.getGroups,
    getActivity: apiMocks.getActivity,
  },
}))

vi.mock("@/lib/api/client/expenses-api", () => ({
  expensesApi: {
    getGroupExpenses: apiMocks.getGroupExpenses,
  },
}))

vi.mock("@/lib/api/client/users-api", () => ({
  usersApi: {
    searchUsers: apiMocks.searchUsers,
  },
}))

import { apiQueryKeys } from "@/hooks/api/query-keys"
import {
  invalidateAcceptedInvite,
  invalidateDeletedGroup,
  invalidateDeletedExpense,
  invalidateExpenseData,
  invalidateProfileData,
  invalidateRevokedInvites,
  invalidateSettlementData,
  invalidateUpdatedExpense,
} from "@/hooks/api/invalidation"
import { groupsQueryOptions } from "@/hooks/api/use-groups"
import { activityQueryOptions } from "@/hooks/api/use-activity"
import { groupExpensesInfiniteQueryOptions } from "@/hooks/api/use-expenses"
import { userSearchQueryOptions } from "@/hooks/api/use-users"

describe("API hook option factories", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("builds stable hierarchical query keys", () => {
    expect(apiQueryKeys.groups.all).toEqual(["groups"])
    expect(apiQueryKeys.groups.detail("group-1")).toEqual(["group", "group-1"])
    expect(apiQueryKeys.expenses.list("group-1")).toEqual(["expenses", "group-1"])
    expect(apiQueryKeys.expenses.detail("group-1", "expense-1")).toEqual([
      "expenses",
      "group-1",
      "detail",
      "expense-1",
    ])
    expect(apiQueryKeys.balances.group("group-1")).toEqual(["balances", "group-1"])
    expect(apiQueryKeys.invites.detail("token-1")).toEqual(["invite", "token-1"])
    expect(apiQueryKeys.users.search("alice")).toEqual(["users", "search", "alice"])
  })

  it("forwards React Query AbortSignal through a query option", async () => {
    const controller = new AbortController()
    apiMocks.getGroups.mockResolvedValue({ groups: [] })
    const options = groupsQueryOptions()

    await runQuery(options, controller.signal)

    expect(apiMocks.getGroups).toHaveBeenCalledWith({ signal: controller.signal })
  })

  it("maps transport groups before storing them in the query cache", async () => {
    apiMocks.getGroups.mockResolvedValue({
      groups: [{
        id: "group-1",
        name: "Trip",
        description: null,
        type: "TRIP",
        currency: "RUB",
        createdById: "user-1",
        createdAt: "2026-09-13T10:00:00.000Z",
        updatedAt: "2026-09-13T10:00:00.000Z",
        members: [],
        _count: { expenses: 4 },
      }],
    })

    const result = await runQuery(
      groupsQueryOptions(),
      new AbortController().signal
    )

    expect(result).toEqual([{
      id: "group-1",
      name: "Trip",
      description: null,
      type: "TRIP",
      currency: "RUB",
      createdById: "user-1",
      createdAt: "2026-09-13T10:00:00.000Z",
      updatedAt: "2026-09-13T10:00:00.000Z",
      members: [],
      expenseCount: 4,
    }])
  })

  it("normalizes user search and disables short queries", async () => {
    const controller = new AbortController()
    apiMocks.searchUsers.mockResolvedValue({ users: [] })
    const enabledOptions = userSearchQueryOptions("  alice  ")
    const disabledOptions = userSearchQueryOptions(" a ")

    await runQuery(enabledOptions, controller.signal)

    expect(enabledOptions.queryKey).toEqual(["users", "search", "alice"])
    expect(enabledOptions.enabled).toBe(true)
    expect(disabledOptions.enabled).toBe(false)
    expect(apiMocks.searchUsers).toHaveBeenCalledWith("alice", {
      signal: controller.signal,
    })
  })

  it("owns expense pagination and forwards page and signal", async () => {
    const controller = new AbortController()
    apiMocks.getGroupExpenses.mockResolvedValue({
      expenses: [],
      total: 0,
      hasNext: false,
    })
    const options = groupExpensesInfiniteQueryOptions("group-1")

    await runQuery(options, controller.signal, { pageParam: 3, direction: "forward" })

    expect(options.initialPageParam).toBe(1)
    expect(apiMocks.getGroupExpenses).toHaveBeenCalledWith("group-1", 3, {
      signal: controller.signal,
    })
    expect(runGetNextPageParam(options, { hasNext: true }, 4)).toBe(5)
    expect(runGetNextPageParam(options, { hasNext: false }, 4)).toBeUndefined()
  })

  it("keeps activity fallback local while preserving successful groups", async () => {
    apiMocks.getGroups.mockResolvedValue({
      groups: [
        { id: "group-1", name: "One" },
        { id: "group-2", name: "Two" },
      ],
    })
    apiMocks.getActivity.mockImplementation((groupId: string) =>
      groupId === "group-1"
        ? Promise.resolve({
            activities: [{
              id: "activity-1",
              groupId: "group-1",
              actorId: "user-1",
              type: "EXPENSE_CREATED",
              entityType: "expense",
              entityId: "expense-1",
              createdAt: "2026-09-13T10:00:00.000Z",
              metadata: {},
              actor: { id: "user-1", name: "Alice" },
            }],
          })
        : Promise.reject(new Error("temporary failure"))
    )

    const result = await runQuery(activityQueryOptions(), new AbortController().signal)

    expect(result).toEqual([
      {
        id: "group-1",
        name: "One",
        activities: [{
          id: "activity-1",
          groupId: "group-1",
          actorId: "user-1",
          type: "EXPENSE_CREATED",
          entityType: "expense",
          entityId: "expense-1",
          createdAt: "2026-09-13T10:00:00.000Z",
          metadata: {
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
          },
          actor: { id: "user-1", name: "Alice" },
        }],
      },
    ])
  })
})

describe("API hook invalidation", () => {
  it("invalidates all financial projections after an expense change", () => {
    const { queryClient, invalidateQueries } = queryClientMock()

    invalidateExpenseData(queryClient, "group-1")

    expect(invalidatedKeys(invalidateQueries)).toEqual([
      ["groups"],
      ["group", "group-1"],
      ["expenses", "group-1"],
      ["balances", "group-1"],
      ["overview"],
      ["activity"],
      ["achievements"],
      ["statistics"],
    ])
  })

  it("invalidates settlement and profile projections deterministically", () => {
    const settlement = queryClientMock()
    invalidateSettlementData(settlement.queryClient, "group-1")
    expect(invalidatedKeys(settlement.invalidateQueries)).toEqual([
      ["groups"],
      ["group", "group-1"],
      ["balances", "group-1"],
      ["overview"],
      ["settlements", "group-1"],
      ["activity"],
      ["achievements"],
      ["statistics"],
    ])

    const profile = queryClientMock()
    invalidateProfileData(profile.queryClient)
    expect(invalidatedKeys(profile.invalidateQueries)).toContainEqual(["group"])
    expect(invalidatedKeys(profile.invalidateQueries)).toContainEqual(["expenses"])
    expect(invalidatedKeys(profile.invalidateQueries)).toContainEqual(["settlements"])
    expect(invalidatedKeys(profile.invalidateQueries)).toContainEqual(["users", "search"])
    expect(invalidatedKeys(profile.invalidateQueries)).toContainEqual(["admin", "feedback"])
  })

  it("removes group-owned caches after deleting a group", () => {
    const { queryClient, removeQueries } = queryClientMock()

    invalidateDeletedGroup(queryClient, "group-1")

    expect(removeQueries.mock.calls.map(([filters]) => filters.queryKey)).toEqual([
      ["group", "group-1"],
      ["expenses", "group-1"],
      ["balances", "group-1"],
      ["settlements", "group-1"],
    ])
  })

  it("refreshes or removes expense detail after a mutation", () => {
    const updated = queryClientMock()
    invalidateUpdatedExpense(updated.queryClient, "group-1", "expense-1")
    expect(invalidatedKeys(updated.invalidateQueries)).toContainEqual([
      "expenses",
      "group-1",
      "detail",
      "expense-1",
    ])

    const deleted = queryClientMock()
    invalidateDeletedExpense(deleted.queryClient, "group-1", "expense-1")
    expect(deleted.removeQueries).toHaveBeenCalledWith({
      queryKey: ["expenses", "group-1", "detail", "expense-1"],
    })
  })

  it("refreshes the accepted invite and its new group projections", () => {
    const { queryClient, invalidateQueries } = queryClientMock()

    invalidateAcceptedInvite(queryClient, "group-1", "token-1")

    expect(invalidatedKeys(invalidateQueries)).toContainEqual(["groups"])
    expect(invalidatedKeys(invalidateQueries)).toContainEqual(["group", "group-1"])
    expect(invalidatedKeys(invalidateQueries)).toContainEqual(["invite", "token-1"])
    expect(invalidatedKeys(invalidateQueries)).toContainEqual(["statistics"])
  })

  it("invalidates every cached invite after revocation", () => {
    const { queryClient, invalidateQueries } = queryClientMock()

    invalidateRevokedInvites(queryClient)

    expect(invalidatedKeys(invalidateQueries)).toEqual([["invite"]])
  })
})

async function runQuery(
  options: { queryFn?: unknown; queryKey: readonly unknown[] },
  signal: AbortSignal,
  additionalContext: Record<string, unknown> = {}
): Promise<unknown> {
  if (typeof options.queryFn !== "function") throw new Error("Expected queryFn")
  return options.queryFn({
    queryKey: options.queryKey,
    signal,
    meta: undefined,
    client: undefined,
    ...additionalContext,
  })
}

function runGetNextPageParam(
  options: { getNextPageParam?: unknown },
  lastPage: { hasNext: boolean },
  pageCount: number
): unknown {
  if (typeof options.getNextPageParam !== "function") {
    throw new Error("Expected getNextPageParam")
  }
  return options.getNextPageParam(
    lastPage,
    Array.from({ length: pageCount }, () => lastPage),
    pageCount,
    Array.from({ length: pageCount }, (_, index) => index + 1)
  )
}

function queryClientMock() {
  const invalidateQueries = vi.fn().mockResolvedValue(undefined)
  const removeQueries = vi.fn()
  return {
    invalidateQueries,
    removeQueries,
    queryClient: { invalidateQueries, removeQueries } as unknown as QueryClient,
  }
}

function invalidatedKeys(invalidateQueries: ReturnType<typeof vi.fn>): unknown[] {
  return invalidateQueries.mock.calls.map(([filters]) => filters.queryKey)
}
