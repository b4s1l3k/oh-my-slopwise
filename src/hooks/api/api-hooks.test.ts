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
  },
}))

vi.mock("@/lib/api/client/activity-api", () => ({
  activityApi: {
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
import { groupsInfiniteQueryOptions } from "@/hooks/api/use-groups"
import { accountActivityInfiniteQueryOptions } from "@/hooks/api/use-activity"
import { groupAccountActivity } from "@/hooks/api/use-activity"
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

  it("owns group pagination and forwards the opaque cursor and signal", async () => {
    const controller = new AbortController()
    apiMocks.getGroups.mockResolvedValue({ groups: [], nextCursor: "cursor-4" })
    const options = groupsInfiniteQueryOptions()

    await runQuery(options, controller.signal, {
      pageParam: "cursor-3",
      direction: "forward",
    })

    expect(options.initialPageParam).toBeNull()
    expect(apiMocks.getGroups).toHaveBeenCalledWith("cursor-3", {
      signal: controller.signal,
    })
    expect(runGetNextPageParam(options, { nextCursor: "cursor-4" }, 4)).toBe("cursor-4")
    expect(runGetNextPageParam(options, { nextCursor: null }, 4)).toBeUndefined()
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
      nextCursor: "cursor-2",
    })

    const result = await runQuery(
      groupsInfiniteQueryOptions(),
      new AbortController().signal,
      { pageParam: null, direction: "forward" }
    )

    expect(result).toEqual({
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
        expenseCount: 4,
      }],
      nextCursor: "cursor-2",
    })
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

  it("owns expense pagination and forwards the opaque cursor and signal", async () => {
    const controller = new AbortController()
    apiMocks.getGroupExpenses.mockResolvedValue({
      expenses: [],
      nextCursor: "cursor-4",
    })
    const options = groupExpensesInfiniteQueryOptions("group-1")

    await runQuery(options, controller.signal, {
      pageParam: "cursor-3",
      direction: "forward",
    })

    expect(options.initialPageParam).toBeNull()
    expect(apiMocks.getGroupExpenses).toHaveBeenCalledWith("group-1", "cursor-3", {
      signal: controller.signal,
    })
    expect(runGetNextPageParam(options, { nextCursor: "cursor-4" }, 4)).toBe("cursor-4")
    expect(runGetNextPageParam(options, { nextCursor: null }, 4)).toBeUndefined()
  })

  it("owns account activity pagination without depending on the group list", async () => {
    const controller = new AbortController()
    apiMocks.getActivity.mockResolvedValue({ activities: [], nextCursor: "activity-cursor-4" })
    const options = accountActivityInfiniteQueryOptions()

    await runQuery(options, controller.signal, {
      pageParam: "activity-cursor-3",
      direction: "forward",
    })

    expect(apiMocks.getActivity).toHaveBeenCalledWith(
      "activity-cursor-3",
      undefined,
      { signal: controller.signal }
    )
    expect(runGetNextPageParam(options, { nextCursor: "activity-cursor-4" }, 4)).toBe(
      "activity-cursor-4"
    )
    expect(apiMocks.getGroups).not.toHaveBeenCalled()
  })

  it("maps and groups account activity in first-seen server order", async () => {
    apiMocks.getActivity.mockResolvedValue({
      activities: [
        accountActivity("activity-3", "group-2", "Second", "2026-09-15T12:00:00.000Z"),
        accountActivity("activity-2", "group-1", "First", "2026-09-15T11:00:00.000Z"),
        accountActivity("activity-1", "group-2", "Second", "2026-09-15T10:00:00.000Z"),
      ],
      nextCursor: null,
    })

    const page = await runQuery(
      accountActivityInfiniteQueryOptions(),
      new AbortController().signal,
      { pageParam: null, direction: "forward" }
    ) as { activities: Parameters<typeof groupAccountActivity>[0] }

    expect(groupAccountActivity(page.activities).map((group) => ({
      id: group.id,
      name: group.name,
      activityIds: group.activities.map((activity) => activity.id),
    }))).toEqual([
      { id: "group-2", name: "Second", activityIds: ["activity-3", "activity-1"] },
      { id: "group-1", name: "First", activityIds: ["activity-2"] },
    ])
  })
})

function accountActivity(id: string, groupId: string, groupName: string, createdAt: string) {
  return {
    id,
    groupId,
    actorId: "user-1",
    type: "GROUP_UPDATED" as const,
    entityType: "group",
    entityId: groupId,
    metadata: { name: groupName },
    createdAt,
    actor: { id: "user-1", name: "Alice" },
    group: { id: groupId, name: groupName },
  }
}

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
      ["activity"],
      ["achievements"],
      ["statistics"],
    ])

    const profile = queryClientMock()
    invalidateProfileData(profile.queryClient)
    expect(invalidatedKeys(profile.invalidateQueries)).toContainEqual(["group"])
    expect(invalidatedKeys(profile.invalidateQueries)).toContainEqual(["expenses"])
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
  lastPage: { nextCursor: string | null },
  pageCount: number
): unknown {
  if (typeof options.getNextPageParam !== "function") {
    throw new Error("Expected getNextPageParam")
  }
  return options.getNextPageParam(
    lastPage,
    Array.from({ length: pageCount }, () => lastPage),
    pageCount,
    Array.from({ length: pageCount }, (_, index) => `cursor-${index + 1}`)
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
