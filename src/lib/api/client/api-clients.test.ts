import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { activityApi } from "@/lib/api/client/activity-api"
import { expensesApi } from "@/lib/api/client/expenses-api"
import { feedbackApi } from "@/lib/api/client/feedback-api"
import { groupsApi } from "@/lib/api/client/groups-api"
import { settlementsApi } from "@/lib/api/client/settlements-api"
import { usersApi } from "@/lib/api/client/users-api"

const fetchMock = vi.fn<typeof fetch>()

type ClientCase = {
  name: string
  invoke: () => Promise<unknown>
  url: string
  method?: string
  body?: unknown
}

const groupCommand = {
  name: "Trip",
  type: "TRIP" as const,
  currency: "RUB" as const,
  memberIds: ["user-1"],
}
const expenseCommand = {
  title: "Dinner",
  amount: 1_000,
  currency: "RUB" as const,
  date: "2026-09-13",
  paidById: "user-1",
  splitType: "EQUAL" as const,
  splits: [{ userId: "user-1" }],
}
const settlementCommand = {
  groupId: "group-1",
  toUserId: "user-2",
  amount: 500,
  currency: "RUB",
  date: "2026-09-13",
}

const cases: ClientCase[] = [
  {
    name: "lists an account activity page",
    invoke: () => activityApi.getActivity("cursor/value", 25),
    url: "/api/v1/activity?cursor=cursor%2Fvalue&limit=25",
  },
  {
    name: "lists a group page",
    invoke: () => groupsApi.getGroups("cursor/value"),
    url: "/api/v1/groups?cursor=cursor%2Fvalue",
  },
  {
    name: "gets a group",
    invoke: () => groupsApi.getGroup("group/id"),
    url: "/api/v1/groups/group%2Fid",
  },
  {
    name: "creates a group",
    invoke: () => groupsApi.createGroup(groupCommand),
    url: "/api/v1/groups",
    method: "POST",
    body: groupCommand,
  },
  {
    name: "updates a group",
    invoke: () => groupsApi.updateGroup("group-1", { name: "New" }),
    url: "/api/v1/groups/group-1",
    method: "PATCH",
    body: { name: "New" },
  },
  {
    name: "deletes a group",
    invoke: () => groupsApi.deleteGroup("group-1"),
    url: "/api/v1/groups/group-1",
    method: "DELETE",
  },
  {
    name: "updates group requisites",
    invoke: () => groupsApi.updateRequisites("group-1", { bankName: "Bank" }),
    url: "/api/v1/groups/group-1/requisites",
    method: "PATCH",
    body: { bankName: "Bank" },
  },
  {
    name: "creates an invite",
    invoke: () => groupsApi.createInvite("group-1"),
    url: "/api/v1/groups/group-1/invite",
    method: "POST",
  },
  {
    name: "revokes an invite",
    invoke: () => groupsApi.revokeInvite("group-1"),
    url: "/api/v1/groups/group-1/invite",
    method: "DELETE",
  },
  {
    name: "gets an invite",
    invoke: () => groupsApi.getInvite("invite token"),
    url: "/api/v1/invites/invite%20token",
  },
  {
    name: "accepts an invite",
    invoke: () => groupsApi.acceptInvite("invite-token"),
    url: "/api/v1/invites/invite-token/accept",
    method: "POST",
  },
  {
    name: "adds a member",
    invoke: () => groupsApi.addMember("group-1", "user-1"),
    url: "/api/v1/groups/group-1/members",
    method: "POST",
    body: { userId: "user-1" },
  },
  {
    name: "removes a member",
    invoke: () => groupsApi.removeMember("group-1", "user/id"),
    url: "/api/v1/groups/group-1/members?userId=user%2Fid",
    method: "DELETE",
  },
  {
    name: "lists group expenses",
    invoke: () => expensesApi.getGroupExpenses("group-1", "cursor/value"),
    url: "/api/v1/groups/group-1/expenses?cursor=cursor%2Fvalue",
  },
  {
    name: "creates an expense",
    invoke: () => expensesApi.createExpense("group-1", expenseCommand),
    url: "/api/v1/groups/group-1/expenses",
    method: "POST",
    body: expenseCommand,
  },
  {
    name: "updates an expense",
    invoke: () => expensesApi.updateExpense("expense-1", expenseCommand),
    url: "/api/v1/expenses/expense-1",
    method: "PATCH",
    body: expenseCommand,
  },
  {
    name: "deletes an expense",
    invoke: () => expensesApi.deleteExpense("expense-1"),
    url: "/api/v1/expenses/expense-1",
    method: "DELETE",
  },
  {
    name: "creates a settlement",
    invoke: () => settlementsApi.createSettlement(settlementCommand),
    url: "/api/v1/settlements",
    method: "POST",
    body: settlementCommand,
  },
  {
    name: "gets overview balances",
    invoke: settlementsApi.getOverviewBalances,
    url: "/api/v1/balances/overview",
  },
  {
    name: "gets group balances",
    invoke: () => settlementsApi.getGroupBalances("group-1"),
    url: "/api/v1/groups/group-1/balances",
  },
  {
    name: "resets group settlements",
    invoke: () => settlementsApi.resetGroupSettlements("group-1"),
    url: "/api/v1/groups/group-1/settlements",
    method: "DELETE",
  },
  {
    name: "registers a user",
    invoke: () => usersApi.registerUser({
      name: "Alice",
      email: "alice@example.com",
      password: "password",
    }),
    url: "/api/v1/users/register",
    method: "POST",
    body: { name: "Alice", email: "alice@example.com", password: "password" },
  },
  { name: "gets profile", invoke: usersApi.getProfile, url: "/api/v1/users/me" },
  {
    name: "updates profile",
    invoke: () => usersApi.updateProfile({ name: "Alice" }),
    url: "/api/v1/users/me",
    method: "PATCH",
    body: { name: "Alice" },
  },
  {
    name: "searches users",
    invoke: () => usersApi.searchUsers("Alice Bob"),
    url: "/api/v1/users/search?q=Alice+Bob",
  },
  {
    name: "gets achievements",
    invoke: usersApi.getAchievements,
    url: "/api/v1/users/me/achievements",
  },
  {
    name: "collects unseen achievements",
    invoke: usersApi.collectUnseenAchievements,
    url: "/api/v1/users/me/achievements/unseen",
    method: "POST",
  },
  {
    name: "gets statistics",
    invoke: usersApi.getStatistics,
    url: "/api/v1/users/me/statistics",
  },
  {
    name: "creates feedback",
    invoke: () => feedbackApi.createFeedback({ message: "Useful feedback" }),
    url: "/api/v1/feedback",
    method: "POST",
    body: { message: "Useful feedback" },
  },
  {
    name: "gets admin feedback",
    invoke: feedbackApi.getAdminFeedback,
    url: "/api/v1/admin/feedback",
  },
]

describe("web API clients", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(Response.json({ result: "ok" }))
    vi.stubGlobal("fetch", fetchMock)
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "")
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it.each(cases)("$name", async ({ invoke, url, method, body }) => {
    await expect(invoke()).resolves.toEqual({ result: "ok" })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [actualUrl, options] = fetchMock.mock.calls[0]
    const headers = new Headers(options?.headers)
    expect(actualUrl).toBe(url)
    expect(options?.method).toBe(method)
    expect(options?.credentials).toBe("include")
    expect(options?.body).toBe(body === undefined ? undefined : JSON.stringify(body))
    expect(headers.get("Accept")).toBe("application/json")
    expect(headers.get("Content-Type")).toBe(
      body === undefined ? null : "application/json"
    )
    expect(headers.get("X-Request-ID")).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("forwards call options through a domain client", async () => {
    const controller = new AbortController()

    await groupsApi.getGroup("group-1", {
      accessToken: "access-token",
      requestId: "request-123",
      signal: controller.signal,
    })

    const options = fetchMock.mock.calls[0][1]
    const headers = new Headers(options?.headers)
    expect(options?.signal).toBe(controller.signal)
    expect(headers.get("Authorization")).toBe("Bearer access-token")
    expect(headers.get("X-Request-ID")).toBe("request-123")
  })
})
