import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  documentedOpenApiSuccessResponseKeys,
  validateOpenApiResponse,
  validatedOpenApiResponseKeys,
} from "../../../../contracts/openapi/openapi-test-validator"

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  bcryptHash: vi.fn(),
  buildProfileStatistics: vi.fn(),
  authentication: {
    authenticateCredentials: vi.fn(),
  },
  groups: {
    getUserGroups: vi.fn(),
    createGroup: vi.fn(),
    getGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    addMember: vi.fn(),
    removeMember: vi.fn(),
  },
  expenses: {
    getGroupExpenses: vi.fn(),
    createExpense: vi.fn(),
    getExpense: vi.fn(),
    updateExpense: vi.fn(),
    deleteExpense: vi.fn(),
  },
  balances: {
    getGroupBalances: vi.fn(),
    getOverviewBalances: vi.fn(),
  },
  settlements: {
    createSettlement: vi.fn(),
    getGroupSettlements: vi.fn(),
    resetSettlements: vi.fn(),
  },
  invites: {
    getOrCreateInvite: vi.fn(),
    revokeInvite: vi.fn(),
    getInviteInfo: vi.fn(),
    acceptInvite: vi.fn(),
  },
  feedback: {
    createFeedback: vi.fn(),
    listFeedback: vi.fn(),
  },
  achievements: {
    getUserAchievements: vi.fn(),
    collectUnseenAchievementUnlocks: vi.fn(),
  },
  statistics: {
    getHistoricalUserStatistics: vi.fn(),
    getHistoricalUserMoneyStatistics: vi.fn(),
  },
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    groupMember: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    activityLog: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }))
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }))
vi.mock("bcryptjs", () => ({ default: { hash: mocks.bcryptHash } }))
vi.mock("@/lib/statistics", () => ({ buildProfileStatistics: mocks.buildProfileStatistics }))
vi.mock("@/services/authentication.service", () => mocks.authentication)
vi.mock("@/services/groups.service", () => mocks.groups)
vi.mock("@/services/expenses.service", () => mocks.expenses)
vi.mock("@/services/balances.service", () => mocks.balances)
vi.mock("@/services/settlements.service", () => mocks.settlements)
vi.mock("@/services/invites.service", () => mocks.invites)
vi.mock("@/services/feedback.service", () => mocks.feedback)
vi.mock("@/services/achievements.service", () => mocks.achievements)
vi.mock("@/services/statistics.service", () => mocks.statistics)

import * as adminFeedbackRoute from "@/app/api/v1/admin/feedback/route"
import * as credentialsRoute from "@/app/api/v1/auth/credentials/route"
import * as balanceOverviewRoute from "@/app/api/v1/balances/overview/route"
import * as expenseRoute from "@/app/api/v1/expenses/[id]/route"
import * as feedbackRoute from "@/app/api/v1/feedback/route"
import * as groupActivityRoute from "@/app/api/v1/groups/[id]/activity/route"
import * as groupBalancesRoute from "@/app/api/v1/groups/[id]/balances/route"
import * as groupExpensesRoute from "@/app/api/v1/groups/[id]/expenses/route"
import * as groupInviteRoute from "@/app/api/v1/groups/[id]/invite/route"
import * as groupMembersRoute from "@/app/api/v1/groups/[id]/members/route"
import * as groupRequisitesRoute from "@/app/api/v1/groups/[id]/requisites/route"
import * as groupRoute from "@/app/api/v1/groups/[id]/route"
import * as groupSettlementsRoute from "@/app/api/v1/groups/[id]/settlements/route"
import * as groupsRoute from "@/app/api/v1/groups/route"
import * as inviteAcceptRoute from "@/app/api/v1/invites/[token]/accept/route"
import * as inviteRoute from "@/app/api/v1/invites/[token]/route"
import * as settlementsRoute from "@/app/api/v1/settlements/route"
import * as achievementsRoute from "@/app/api/v1/users/me/achievements/route"
import * as unseenAchievementsRoute from "@/app/api/v1/users/me/achievements/unseen/route"
import * as currentUserRoute from "@/app/api/v1/users/me/route"
import * as statisticsRoute from "@/app/api/v1/users/me/statistics/route"
import * as registerRoute from "@/app/api/v1/users/register/route"
import * as userSearchRoute from "@/app/api/v1/users/search/route"

const groupContext = { params: Promise.resolve({ id: "group-1" }) }
const expenseContext = { params: Promise.resolve({ id: "expense-1" }) }
const inviteContext = { params: Promise.resolve({ token: "invite-token" }) }
const timestamp = "2026-09-13T10:00:00.000Z"

const userSummary = {
  id: "user-1",
  name: "Alice",
  avatarUrl: null,
}

const groupMember = {
  id: "membership-1",
  groupId: "group-1",
  userId: "user-1",
  role: "ADMIN" as const,
  joinedAt: timestamp,
  isActive: true,
  payeeName: null,
  bankName: null,
  payeeAccount: null,
  user: userSummary,
}

const groupDto = {
  id: "group-1",
  name: "Trip",
  description: null,
  type: "TRIP" as const,
  currency: "RUB",
  createdById: "user-1",
  createdAt: timestamp,
  updatedAt: timestamp,
  members: [groupMember],
}

const expenseDto = {
  id: "expense-1",
  groupId: "group-1",
  paidById: "user-1",
  createdById: "user-1",
  title: "Dinner",
  amount: 10_000,
  currency: "RUB",
  amountBase: 10_000,
  customRate: null,
  category: null,
  splitType: "EQUAL" as const,
  date: timestamp,
  notes: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  paidBy: userSummary,
  createdBy: userSummary,
  splits: [
    {
      id: "split-1",
      expenseId: "expense-1",
      userId: "user-1",
      amount: 10_000,
      amountBase: 10_000,
      share: null,
      percentage: null,
      user: userSummary,
    },
  ],
  settlements: [],
}

const settlementDto = {
  id: "settlement-1",
  groupId: "group-1",
  expenseId: null,
  fromUserId: "user-1",
  toUserId: "user-2",
  amount: 5_000,
  currency: "RUB",
  amountBase: 5_000,
  date: timestamp,
  notes: null,
  createdAt: timestamp,
  fromUser: userSummary,
  toUser: { id: "user-2", name: "Bob", avatarUrl: null },
}

function request(
  path: string,
  method = "GET",
  body?: unknown
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function expectJson(
  response: Response,
  status: number,
  body: unknown,
  operationId: string
): Promise<void> {
  expect(response.status).toBe(status)
  expect(response.headers.get("content-type")).toContain("application/json")
  const responseBody = await response.json()
  expect(responseBody).toEqual(body)
  expect(validateOpenApiResponse(operationId, status, responseBody)).toEqual({
    valid: true,
    errors: [],
  })
}

const groupCommand = {
  name: "Trip",
  type: "TRIP" as const,
  currency: "RUB" as const,
  memberIds: ["user-2"],
}

const expenseCommand = {
  title: "Dinner",
  amount: 10_000,
  currency: "RUB" as const,
  date: "2026-09-13",
  paidById: "user-1",
  splitType: "EQUAL" as const,
  splits: [{ userId: "user-1" }, { userId: "user-2" }],
}

const settlementCommand = {
  groupId: "group-1",
  toUserId: "user-2",
  amount: 5_000,
  currency: "RUB",
  date: "2026-09-13",
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ user: { id: "user-1", role: "USER" } })
})

describe("/api/v1 authentication contract", () => {
  const protectedOperations: Array<[string, string, () => Promise<Response>]> = [
    ["GET /admin/feedback", "listAdminFeedbackV1", () => adminFeedbackRoute.GET()],
    ["GET /balances/overview", "getBalanceOverviewV1", () => balanceOverviewRoute.GET()],
    ["GET /expenses/:id", "getExpenseV1", () => expenseRoute.GET(request("/api/v1/expenses/expense-1"), expenseContext)],
    ["PATCH /expenses/:id", "updateExpenseV1", () => expenseRoute.PATCH(request("/api/v1/expenses/expense-1", "PATCH", expenseCommand), expenseContext)],
    ["DELETE /expenses/:id", "deleteExpenseV1", () => expenseRoute.DELETE(request("/api/v1/expenses/expense-1", "DELETE"), expenseContext)],
    ["POST /feedback", "createFeedbackV1", () => feedbackRoute.POST(request("/api/v1/feedback", "POST", { message: "Useful feedback" }))],
    ["GET /groups/:id/activity", "listGroupActivityV1", () => groupActivityRoute.GET(request("/api/v1/groups/group-1/activity"), groupContext)],
    ["GET /groups/:id/balances", "getGroupBalancesV1", () => groupBalancesRoute.GET(request("/api/v1/groups/group-1/balances"), groupContext)],
    ["GET /groups/:id/expenses", "listGroupExpensesV1", () => groupExpensesRoute.GET(request("/api/v1/groups/group-1/expenses"), groupContext)],
    ["POST /groups/:id/expenses", "createExpenseV1", () => groupExpensesRoute.POST(request("/api/v1/groups/group-1/expenses", "POST", expenseCommand), groupContext)],
    ["POST /groups/:id/invite", "getOrCreateGroupInviteV1", () => groupInviteRoute.POST(request("/api/v1/groups/group-1/invite", "POST"), groupContext)],
    ["DELETE /groups/:id/invite", "revokeGroupInviteV1", () => groupInviteRoute.DELETE(request("/api/v1/groups/group-1/invite", "DELETE"), groupContext)],
    ["POST /groups/:id/members", "addGroupMemberV1", () => groupMembersRoute.POST(request("/api/v1/groups/group-1/members", "POST", { userId: "user-2" }), groupContext)],
    ["DELETE /groups/:id/members", "removeGroupMemberV1", () => groupMembersRoute.DELETE(request("/api/v1/groups/group-1/members?userId=user-2", "DELETE"), groupContext)],
    ["PATCH /groups/:id/requisites", "updateGroupRequisitesV1", () => groupRequisitesRoute.PATCH(request("/api/v1/groups/group-1/requisites", "PATCH", {}), groupContext)],
    ["GET /groups/:id", "getGroupV1", () => groupRoute.GET(request("/api/v1/groups/group-1"), groupContext)],
    ["PATCH /groups/:id", "updateGroupV1", () => groupRoute.PATCH(request("/api/v1/groups/group-1", "PATCH", { name: "New" }), groupContext)],
    ["DELETE /groups/:id", "deleteGroupV1", () => groupRoute.DELETE(request("/api/v1/groups/group-1", "DELETE"), groupContext)],
    ["GET /groups/:id/settlements", "listGroupSettlementsV1", () => groupSettlementsRoute.GET(request("/api/v1/groups/group-1/settlements"), groupContext)],
    ["DELETE /groups/:id/settlements", "resetGroupSettlementsV1", () => groupSettlementsRoute.DELETE(request("/api/v1/groups/group-1/settlements", "DELETE"), groupContext)],
    ["GET /groups", "listGroupsV1", () => groupsRoute.GET()],
    ["POST /groups", "createGroupV1", () => groupsRoute.POST(request("/api/v1/groups", "POST", groupCommand))],
    ["POST /invites/:token/accept", "acceptInviteV1", () => inviteAcceptRoute.POST(request("/api/v1/invites/invite-token/accept", "POST"), inviteContext)],
    ["GET /invites/:token", "getInviteV1", () => inviteRoute.GET(request("/api/v1/invites/invite-token"), inviteContext)],
    ["POST /settlements", "createSettlementV1", () => settlementsRoute.POST(request("/api/v1/settlements", "POST", settlementCommand))],
    ["GET /users/me/achievements", "getCurrentUserAchievementsV1", () => achievementsRoute.GET()],
    ["POST /users/me/achievements/unseen", "claimCurrentUserAchievementNotificationsV1", () => unseenAchievementsRoute.POST()],
    ["GET /users/me", "getCurrentUserV1", () => currentUserRoute.GET()],
    ["PATCH /users/me", "updateCurrentUserV1", () => currentUserRoute.PATCH(request("/api/v1/users/me", "PATCH", { name: "New Name" }))],
    ["GET /users/me/statistics", "getCurrentUserStatisticsV1", () => statisticsRoute.GET()],
    ["GET /users/search", "searchUsersV1", () => userSearchRoute.GET(request("/api/v1/users/search?q=al"))],
  ]

  it.each(protectedOperations)("%s returns the same 401 JSON envelope", async (_name, operationId, invoke) => {
    mocks.auth.mockResolvedValue(null)
    await expectJson(await invoke(), 401, { error: "Unauthorized" }, operationId)
  })
})

describe("/api/v1 credentials boundary", () => {
  const credentials = {
    email: "user@example.com",
    password: "safe-password",
  }

  it("returns only stable session claims for valid credentials", async () => {
    const user = {
      id: "user-1",
      email: "user@example.com",
      name: "Alice",
      avatarUrl: null,
      role: "USER" as const,
    }
    mocks.authentication.authenticateCredentials.mockResolvedValue(user)

    await expectJson(
      await credentialsRoute.POST(
        request("/api/v1/auth/credentials", "POST", credentials)
      ),
      200,
      { user },
      "authenticateCredentialsV1"
    )
    expect(mocks.authentication.authenticateCredentials).toHaveBeenCalledWith(
      credentials.email,
      credentials.password
    )
  })

  it.each([
    {},
    { email: "not-an-email", password: "safe-password" },
    { ...credentials, unexpected: true },
  ])("uses one 401 envelope for malformed credential input", async (body) => {
    await expectJson(
      await credentialsRoute.POST(
        request("/api/v1/auth/credentials", "POST", body)
      ),
      401,
      { error: "Unauthorized" },
      "authenticateCredentialsV1"
    )
    expect(mocks.authentication.authenticateCredentials).not.toHaveBeenCalled()
  })

  it("does not distinguish an unknown user from an invalid password", async () => {
    mocks.authentication.authenticateCredentials.mockResolvedValue(null)

    await expectJson(
      await credentialsRoute.POST(
        request("/api/v1/auth/credentials", "POST", credentials)
      ),
      401,
      { error: "Unauthorized" },
      "authenticateCredentialsV1"
    )
  })

  it("maps an identity provider failure without leaking details", async () => {
    mocks.authentication.authenticateCredentials.mockRejectedValue(
      new Error("database unavailable")
    )

    await expectJson(
      await credentialsRoute.POST(
        request("/api/v1/auth/credentials", "POST", credentials)
      ),
      500,
      { error: { message: "Internal server error" } },
      "authenticateCredentialsV1"
    )
  })
})

describe("/api/v1 route handler success contracts", () => {
  it("covers groups and memberships", async () => {
    const member = {
      ...groupMember,
      id: "membership-2",
      userId: "user-2",
      role: "MEMBER" as const,
      user: { id: "user-2", name: "Bob", avatarUrl: null },
    }
    const sensitiveMember = {
      ...member,
      payeeName: "Secret Recipient",
      bankName: "Secret Bank",
      payeeAccount: "Secret Account",
      user: {
        ...member.user,
        payeeName: "Secret Profile Recipient",
        bankName: "Secret Profile Bank",
        payeeAccount: "Secret Profile Account",
      },
    }
    const sensitiveGroup = { ...groupDto, members: [sensitiveMember] }
    const redactedMember = {
      ...member,
      payeeName: null,
      bankName: null,
      payeeAccount: null,
    }
    const redactedGroup = { ...groupDto, members: [redactedMember] }
    mocks.groups.getUserGroups.mockResolvedValue([{ ...sensitiveGroup, persistenceOnly: true }])
    mocks.groups.createGroup.mockResolvedValue(sensitiveGroup)
    mocks.groups.getGroup.mockResolvedValue(groupDto)
    mocks.groups.updateGroup.mockResolvedValue({ ...sensitiveGroup, name: "New" })
    mocks.groups.deleteGroup.mockResolvedValue(undefined)
    mocks.groups.addMember.mockResolvedValue(sensitiveMember)
    mocks.groups.removeMember.mockResolvedValue(member)

    await expectJson(await groupsRoute.GET(), 200, { groups: [redactedGroup] }, "listGroupsV1")
    await expectJson(
      await groupsRoute.POST(request("/api/v1/groups", "POST", groupCommand)),
      201,
      { group: redactedGroup },
      "createGroupV1"
    )
    await expectJson(
      await groupRoute.GET(request("/api/v1/groups/group-1"), groupContext),
      200,
      { group: groupDto },
      "getGroupV1"
    )
    await expectJson(
      await groupRoute.PATCH(
        request("/api/v1/groups/group-1", "PATCH", { name: "New" }),
        groupContext
      ),
      200,
      { group: { ...redactedGroup, name: "New" } },
      "updateGroupV1"
    )
    await expectJson(
      await groupRoute.DELETE(request("/api/v1/groups/group-1", "DELETE"), groupContext),
      200,
      {},
      "deleteGroupV1"
    )
    await expectJson(
      await groupMembersRoute.POST(
        request("/api/v1/groups/group-1/members", "POST", { userId: "user-2" }),
        groupContext
      ),
      201,
      { member: redactedMember },
      "addGroupMemberV1"
    )
    await expectJson(
      await groupMembersRoute.DELETE(
        request("/api/v1/groups/group-1/members?userId=user-2", "DELETE"),
        groupContext
      ),
      200,
      {},
      "removeGroupMemberV1"
    )

    expect(mocks.groups.createGroup).toHaveBeenCalledWith("user-1", groupCommand)
    expect(mocks.groups.addMember).toHaveBeenCalledWith("group-1", "user-1", "user-2")
    expect(mocks.groups.removeMember).toHaveBeenCalledWith("group-1", "user-1", "user-2")
  })

  it("covers expense collection and resource operations", async () => {
    const page = { expenses: [{ ...expenseDto, persistenceOnly: true }], total: 1, hasNext: false }
    const expectedPage = { expenses: [expenseDto], total: 1, hasNext: false }
    mocks.expenses.getGroupExpenses.mockResolvedValue(page)
    mocks.expenses.createExpense.mockResolvedValue(expenseDto)
    mocks.expenses.getExpense.mockResolvedValue(expenseDto)
    mocks.expenses.updateExpense.mockResolvedValue(expenseDto)
    mocks.expenses.deleteExpense.mockResolvedValue(undefined)

    await expectJson(
      await groupExpensesRoute.GET(
        request("/api/v1/groups/group-1/expenses?page=2"),
        groupContext
      ),
      200,
      expectedPage,
      "listGroupExpensesV1"
    )
    await expectJson(
      await groupExpensesRoute.POST(
        request("/api/v1/groups/group-1/expenses", "POST", expenseCommand),
        groupContext
      ),
      201,
      { expense: expenseDto },
      "createExpenseV1"
    )
    await expectJson(
      await expenseRoute.GET(request("/api/v1/expenses/expense-1"), expenseContext),
      200,
      { expense: expenseDto },
      "getExpenseV1"
    )
    await expectJson(
      await expenseRoute.PATCH(
        request("/api/v1/expenses/expense-1", "PATCH", expenseCommand),
        expenseContext
      ),
      200,
      { expense: expenseDto },
      "updateExpenseV1"
    )
    await expectJson(
      await expenseRoute.DELETE(
        request("/api/v1/expenses/expense-1", "DELETE"),
        expenseContext
      ),
      200,
      {},
      "deleteExpenseV1"
    )

    expect(mocks.expenses.getGroupExpenses).toHaveBeenCalledWith("group-1", "user-1", 2)
    expect(mocks.expenses.createExpense).toHaveBeenCalledWith(
      "group-1",
      "user-1",
      expenseCommand
    )
  })

  it("covers balances and settlements", async () => {
    const balances = { simplified: [], raw: [] }
    const overview = { totals: [], friendBalances: [] }
    mocks.balances.getGroupBalances.mockResolvedValue(balances)
    mocks.balances.getOverviewBalances.mockResolvedValue(overview)
    mocks.settlements.createSettlement.mockResolvedValue(settlementDto)
    mocks.settlements.getGroupSettlements.mockResolvedValue([settlementDto])
    mocks.settlements.resetSettlements.mockResolvedValue({ removed: 1 })

    await expectJson(
      await groupBalancesRoute.GET(request("/api/v1/groups/group-1/balances"), groupContext),
      200,
      { balances },
      "getGroupBalancesV1"
    )
    await expectJson(await balanceOverviewRoute.GET(), 200, overview, "getBalanceOverviewV1")
    await expectJson(
      await settlementsRoute.POST(
        request("/api/v1/settlements", "POST", settlementCommand)
      ),
      201,
      { settlement: settlementDto },
      "createSettlementV1"
    )
    await expectJson(
      await groupSettlementsRoute.GET(
        request("/api/v1/groups/group-1/settlements"),
        groupContext
      ),
      200,
      { settlements: [settlementDto] },
      "listGroupSettlementsV1"
    )
    await expectJson(
      await groupSettlementsRoute.DELETE(
        request("/api/v1/groups/group-1/settlements", "DELETE"),
        groupContext
      ),
      200,
      { removed: 1 },
      "resetGroupSettlementsV1"
    )
  })

  it("covers invite operations", async () => {
    const invite = {
      groupId: "group-1",
      groupName: "Trip",
      memberCount: 2,
      isAlreadyMember: false,
    }
    mocks.invites.getOrCreateInvite.mockResolvedValue({ token: "invite-token" })
    mocks.invites.revokeInvite.mockResolvedValue(undefined)
    mocks.invites.getInviteInfo.mockResolvedValue(invite)
    mocks.invites.acceptInvite.mockResolvedValue({ groupId: "group-1" })

    await expectJson(
      await groupInviteRoute.POST(
        request("/api/v1/groups/group-1/invite", "POST"),
        groupContext
      ),
      200,
      { token: "invite-token" },
      "getOrCreateGroupInviteV1"
    )
    await expectJson(
      await groupInviteRoute.DELETE(
        request("/api/v1/groups/group-1/invite", "DELETE"),
        groupContext
      ),
      200,
      {},
      "revokeGroupInviteV1"
    )
    await expectJson(
      await inviteRoute.GET(request("/api/v1/invites/invite-token"), inviteContext),
      200,
      { invite },
      "getInviteV1"
    )
    await expectJson(
      await inviteAcceptRoute.POST(
        request("/api/v1/invites/invite-token/accept", "POST"),
        inviteContext
      ),
      200,
      { groupId: "group-1" },
      "acceptInviteV1"
    )
  })

  it("covers profile, search, activity and group requisites", async () => {
    const user = {
      ...userSummary,
      email: "alice@example.com",
      payeeName: null,
      bankName: null,
      payeeAccount: null,
      createdAt: timestamp,
    }
    const searched = { id: "user-2", name: "Alex", avatarUrl: null }
    const activity = {
      id: "activity-1",
      groupId: "group-1",
      actorId: "user-1",
      type: "GROUP_UPDATED" as const,
      entityType: "group",
      entityId: "group-1",
      metadata: { name: "Trip" },
      createdAt: timestamp,
      actor: { id: "user-1", name: "Alice" },
    }
    mocks.prisma.user.findUnique.mockResolvedValue(user)
    mocks.prisma.user.update.mockResolvedValue({ ...user, name: "New Name" })
    mocks.prisma.user.findMany.mockResolvedValue([searched])
    mocks.prisma.groupMember.findUnique.mockResolvedValue({ isActive: true })
    mocks.prisma.groupMember.update.mockResolvedValue({
      payeeName: "Alice",
      bankName: null,
      payeeAccount: "123",
    })
    mocks.prisma.activityLog.findMany.mockResolvedValue([
      { ...activity, metadata: { ...activity.metadata, persistenceOnly: true } },
    ])

    await expectJson(await currentUserRoute.GET(), 200, { user }, "getCurrentUserV1")
    await expectJson(
      await currentUserRoute.PATCH(
        request("/api/v1/users/me", "PATCH", { name: "New Name" })
      ),
      200,
      { user: { ...user, name: "New Name" } },
      "updateCurrentUserV1"
    )
    await expectJson(
      await userSearchRoute.GET(request("/api/v1/users/search?q=alex")),
      200,
      { users: [searched] },
      "searchUsersV1"
    )
    await expectJson(
      await groupActivityRoute.GET(
        request("/api/v1/groups/group-1/activity"),
        groupContext
      ),
      200,
      { activities: [activity] },
      "listGroupActivityV1"
    )
    await expectJson(
      await groupRequisitesRoute.PATCH(
        request("/api/v1/groups/group-1/requisites", "PATCH", {
          payeeName: " Alice ",
          payeeAccount: " 123 ",
        }),
        groupContext
      ),
      200,
      { requisites: { payeeName: "Alice", bankName: null, payeeAccount: "123" } },
      "updateGroupRequisitesV1"
    )

    expect(mocks.prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 })
    )
    expect(mocks.prisma.groupMember.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { payeeName: "Alice", payeeAccount: "123" },
      })
    )
  })

  it("covers statistics and achievement operations", async () => {
    const lifetime = { expensesCreated: 3 }
    const money = { spent: [{ currency: "RUB", amount: 10_000 }], returned: [] }
    const statistics = {
      money,
      overview: {
        expensesParticipated: 4,
        expensesCreated: 3,
        expensesPaid: 2,
        activeGroups: 1,
      },
      splits: { equal: 2, exact: 1, percentage: 0 },
      collaboration: {
        uniquePeople: 2,
        settlementsSent: 1,
        settlementsReceived: 0,
        cashSettlements: 0,
        invitesCreated: 1,
        createdForOthers: 0,
      },
      groups: { created: 1, home: 0, trip: 1, couple: 0, other: 0 },
      mastery: { currenciesUsed: 1, splitMethodsUsed: 2, customRates: 0 },
      records: {
        maxExpenseParticipants: 2,
        maxPaidParticipants: 2,
        maxGroupMembers: 2,
        maxGroupExpenses: 3,
        accountAgeDays: 30,
      },
    }
    const achievements = {
      summary: { unlocked: 1, total: 49 },
      achievements: [{
        id: "first-group",
        title: "Group",
        description: "Join a group",
        category: "START" as const,
        icon: "users",
        unlocked: true,
        progress: 1,
        target: 1,
        percent: 100,
        hidden: false,
      }],
    }
    const unlocked = [{ id: "first-group", title: "Group", description: "", icon: "users" }]
    mocks.statistics.getHistoricalUserStatistics.mockResolvedValue(lifetime)
    mocks.statistics.getHistoricalUserMoneyStatistics.mockResolvedValue(money)
    mocks.buildProfileStatistics.mockReturnValue(statistics)
    mocks.achievements.getUserAchievements.mockResolvedValue(achievements)
    mocks.achievements.collectUnseenAchievementUnlocks.mockResolvedValue(unlocked)

    await expectJson(
      await statisticsRoute.GET(),
      200,
      { statistics },
      "getCurrentUserStatisticsV1"
    )
    await expectJson(
      await achievementsRoute.GET(),
      200,
      achievements,
      "getCurrentUserAchievementsV1"
    )
    await expectJson(
      await unseenAchievementsRoute.POST(),
      200,
      { unlocked },
      "claimCurrentUserAchievementNotificationsV1"
    )
    expect(mocks.buildProfileStatistics).toHaveBeenCalledWith(lifetime, money)
  })

  it("covers feedback and registration", async () => {
    const feedback = {
      id: "feedback-1",
      userId: "user-1",
      message: "Useful feedback",
      createdAt: timestamp,
    }
    const registered = {
      id: "user-new",
      email: "new@example.com",
      name: "New User",
      avatarUrl: null,
    }
    mocks.feedback.createFeedback.mockResolvedValue(feedback)
    mocks.feedback.listFeedback.mockResolvedValue([feedback])
    mocks.prisma.user.findUnique.mockResolvedValue(null)
    mocks.bcryptHash.mockResolvedValue("password-hash")
    mocks.prisma.user.create.mockResolvedValue(registered)

    await expectJson(
      await feedbackRoute.POST(
        request("/api/v1/feedback", "POST", { message: "Useful feedback" })
      ),
      201,
      { feedback },
      "createFeedbackV1"
    )
    mocks.auth.mockResolvedValue({ user: { id: "admin", role: "ADMIN" } })
    await expectJson(
      await adminFeedbackRoute.GET(),
      200,
      { feedbacks: [feedback] },
      "listAdminFeedbackV1"
    )
    mocks.auth.mockResolvedValue(null)
    await expectJson(
      await registerRoute.POST(
        request("/api/v1/users/register", "POST", {
          email: "new@example.com",
          name: "New User",
          password: "safe-password",
        })
      ),
      201,
      { user: registered },
      "registerUserV1"
    )
    expect(mocks.auth).toHaveBeenCalledTimes(2)
    expect(mocks.bcryptHash).toHaveBeenCalledWith("safe-password", 10)
    expect(mocks.prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          email: "new@example.com",
          name: "New User",
          passwordHash: "password-hash",
        },
      })
    )
  })
})

describe("/api/v1 route handler error contracts", () => {
  it("returns exact query errors before calling services", async () => {
    await expectJson(
      await groupExpensesRoute.GET(
        request("/api/v1/groups/group-1/expenses?page=0"),
        groupContext
      ),
      400,
      { error: "Invalid page" },
      "listGroupExpensesV1"
    )
    await expectJson(
      await groupMembersRoute.DELETE(
        request("/api/v1/groups/group-1/members", "DELETE"),
        groupContext
      ),
      400,
      { error: "userId required" },
      "removeGroupMemberV1"
    )
    expect(mocks.expenses.getGroupExpenses).not.toHaveBeenCalled()
    expect(mocks.groups.removeMember).not.toHaveBeenCalled()
  })

  it("returns the Zod flattened envelope for invalid JSON commands", async () => {
    mocks.prisma.groupMember.findUnique.mockResolvedValue({ isActive: true })
    const cases: Array<[string, () => Promise<Response>]> = [
      ["createGroupV1", () => groupsRoute.POST(request("/api/v1/groups", "POST", {}))],
      ["updateGroupV1", () => groupRoute.PATCH(request("/api/v1/groups/group-1", "PATCH", { name: "" }), groupContext)],
      ["createExpenseV1", () => groupExpensesRoute.POST(request("/api/v1/groups/group-1/expenses", "POST", {}), groupContext)],
      ["updateExpenseV1", () => expenseRoute.PATCH(request("/api/v1/expenses/expense-1", "PATCH", {}), expenseContext)],
      ["createSettlementV1", () => settlementsRoute.POST(request("/api/v1/settlements", "POST", {}))],
      ["createFeedbackV1", () => feedbackRoute.POST(request("/api/v1/feedback", "POST", {}))],
      ["updateCurrentUserV1", () => currentUserRoute.PATCH(request("/api/v1/users/me", "PATCH", { avatarUrl: "javascript:alert(1)" }))],
      ["addGroupMemberV1", () => groupMembersRoute.POST(request("/api/v1/groups/group-1/members", "POST", {}), groupContext)],
      ["updateGroupRequisitesV1", () => groupRequisitesRoute.PATCH(
        request("/api/v1/groups/group-1/requisites", "PATCH", { bankName: "x".repeat(101) }),
        groupContext
      )],
      ["registerUserV1", () => registerRoute.POST(request("/api/v1/users/register", "POST", {}))],
      ["createGroupV1", () => groupsRoute.POST(new Request("http://localhost/api/v1/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }))],
    ]

    for (const [operationId, invoke] of cases) {
      const response = await invoke()
      expect(response.status).toBe(422)
      const responseBody = await response.json()
      expect(responseBody).toEqual({
        error: expect.objectContaining({
          formErrors: expect.any(Array),
          fieldErrors: expect.any(Object),
        }),
      })
      expect(validateOpenApiResponse(operationId, 422, responseBody)).toEqual({
        valid: true,
        errors: [],
      })
    }
  })

  it("maps domain errors to their stable status, code and message", async () => {
    mocks.expenses.updateExpense.mockRejectedValue(new Error("PAYER_NOT_MEMBER"))
    await expectJson(
      await expenseRoute.PATCH(
        request("/api/v1/expenses/expense-1", "PATCH", expenseCommand),
        expenseContext
      ),
      422,
      {
        error: {
          code: "PAYER_NOT_MEMBER",
          message: "Плательщик не состоит в группе",
        },
      },
      "updateExpenseV1"
    )

    mocks.groups.deleteGroup.mockRejectedValue(new Error("GROUP_HAS_BALANCES"))
    await expectJson(
      await groupRoute.DELETE(request("/api/v1/groups/group-1", "DELETE"), groupContext),
      409,
      {
        error: {
          code: "GROUP_HAS_BALANCES",
          message: "Сначала завершите все расчёты: в группе не должно остаться долгов",
        },
      },
      "deleteGroupV1"
    )
  })

  it("maps unavailable dependencies and unknown service failures", async () => {
    mocks.expenses.createExpense.mockRejectedValue(new Error("RATE_UNAVAILABLE"))
    await expectJson(
      await groupExpensesRoute.POST(
        request("/api/v1/groups/group-1/expenses", "POST", expenseCommand),
        groupContext
      ),
      503,
      {
        error: {
          code: "RATE_UNAVAILABLE",
          message: "Курс ЦБ временно недоступен — укажите курс вручную",
        },
      },
      "createExpenseV1"
    )

    mocks.feedback.createFeedback.mockRejectedValue(new Error("unexpected"))
    await expectJson(
      await feedbackRoute.POST(
        request("/api/v1/feedback", "POST", { message: "Useful feedback" })
      ),
      500,
      { error: { message: "Внутренняя ошибка" } },
      "createFeedbackV1"
    )
  })

  it("keeps route-specific not-found and forbidden envelopes", async () => {
    mocks.groups.getGroup.mockResolvedValue(null)
    await expectJson(
      await groupRoute.GET(request("/api/v1/groups/group-1"), groupContext),
      404,
      { error: "Not found" },
      "getGroupV1"
    )

    mocks.invites.getInviteInfo.mockResolvedValue(null)
    await expectJson(
      await inviteRoute.GET(request("/api/v1/invites/invite-token"), inviteContext),
      404,
      { error: "Приглашение недействительно" },
      "getInviteV1"
    )

    mocks.auth.mockResolvedValue({ user: { id: "user-1", role: "USER" } })
    await expectJson(
      await adminFeedbackRoute.GET(),
      403,
      { error: "Forbidden" },
      "listAdminFeedbackV1"
    )
  })

  it("keeps achievement notification failures non-critical", async () => {
    mocks.achievements.collectUnseenAchievementUnlocks.mockRejectedValue(
      new Error("database unavailable")
    )
    await expectJson(
      await unseenAchievementsRoute.POST(),
      200,
      { unlocked: [] },
      "claimCurrentUserAchievementNotificationsV1"
    )
  })

  it("returns an empty user-search result without querying the database", async () => {
    await expectJson(
      await userSearchRoute.GET(request("/api/v1/users/search?q=a")),
      200,
      { users: [] },
      "searchUsersV1"
    )
    expect(mocks.prisma.user.findMany).not.toHaveBeenCalled()
  })
})

describe("/api/v1 OpenAPI response-schema coverage", () => {
  it("validates a real successful handler response for every operation", () => {
    const validatedSuccessResponses = validatedOpenApiResponseKeys().filter((key) =>
      /:2\d\d$/.test(key)
    )

    expect(validatedSuccessResponses).toEqual(documentedOpenApiSuccessResponseKeys())
  })
})
