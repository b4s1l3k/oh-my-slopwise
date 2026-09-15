import type {
  AcceptInviteResponseDto,
  AchievementCollectionResponseDto,
  AchievementDto,
  AchievementUnlockDto,
  AchievementUnlocksResponseDto,
  AccountActivityPageResponseDto,
  ActivityDto,
  ActivityListResponseDto,
  BalanceOverviewDto,
  CurrencyDto,
  ExpenseDto,
  ExpensePageResponseDto,
  ExpenseResponseDto,
  FeedbackDto,
  FeedbackListResponseDto,
  FeedbackResponseDto,
  GroupBalancesDto,
  GroupBalancesResponseDto,
  GroupDto,
  GroupListResponseDto,
  GroupMemberDto,
  GroupMemberResponseDto,
  GroupMemberUserDto,
  GroupResponseDto,
  InviteInfoDto,
  InviteInfoResponseDto,
  InviteTokenResponseDto,
  ProfileResponseDto,
  ProfileStatisticsDto,
  ProfileStatisticsResponseDto,
  RegisteredUserDto,
  RegisterUserResponseDto,
  RequisitesDto,
  RequisitesResponseDto,
  ResetSettlementsResponseDto,
  SettlementDto,
  SettlementListResponseDto,
  SettlementResponseDto,
  UserNameDto,
  UserSearchResponseDto,
  UserSummaryDto,
} from "@contract/v1"
import { isSupportedCurrency } from "@/lib/currencies"
import { isValidCalendarDate } from "@/lib/utils/calendar-date"

type TimestampSource = Date | string
type DecimalSource = { toNumber(): number }

type UserSummarySource = {
  id: string
  name: string
  avatarUrl: string | null
}

type UserNameSource = Pick<UserSummarySource, "id" | "name">

type GroupMemberUserSource = UserSummarySource & {
  payeeName?: string | null
  bankName?: string | null
  payeeAccount?: string | null
}

type GroupMemberSource = {
  id: string
  groupId: string
  userId: string
  role: "ADMIN" | "MEMBER"
  joinedAt: TimestampSource
  isActive: boolean
  payeeName?: string | null
  bankName?: string | null
  payeeAccount?: string | null
  user: GroupMemberUserSource
}

type GroupSource = {
  id: string
  name: string
  description: string | null
  type: "HOME" | "TRIP" | "COUPLE" | "OTHER"
  currency: string
  createdById: string
  createdAt: TimestampSource
  updatedAt: TimestampSource
  members: GroupMemberSource[]
  _count?: { expenses: number }
}

type ExpenseSource = {
  id: string
  groupId: string
  paidById: string
  createdById: string
  title: string
  amount: number
  currency: string
  amountBase: number
  customRate: number | DecimalSource | null
  category: string | null
  splitType: "EQUAL" | "EXACT" | "PERCENTAGE"
  date: TimestampSource
  notes: string | null
  createdAt: TimestampSource
  updatedAt: TimestampSource
  paidBy: UserSummarySource
  createdBy: UserSummarySource
  splits: Array<{
    id: string
    expenseId: string
    userId: string
    amount: number
    amountBase: number
    percentage: number | null
    user: UserSummarySource
  }>
  settlements: Array<{
    id: string
    amount: number
    currency: string
    amountBase: number
    fromUser: UserNameSource
  }>
}

type SettlementSource = {
  id: string
  groupId: string
  expenseId: string | null
  fromUserId: string
  toUserId: string
  amount: number
  currency: string
  amountBase: number
  date: TimestampSource
  notes: string | null
  createdAt: TimestampSource
  fromUser: UserSummarySource
  toUser: UserSummarySource
}

type ActivitySource = {
  id: string
  groupId: string
  actorId: string
  type: ActivityDto["type"]
  entityType: string
  entityId: string
  metadata: unknown
  createdAt: TimestampSource
  actor: UserNameSource
}

type AccountActivitySource = ActivitySource & {
  group: {
    id: string
    name: string
  }
}

type FeedbackSource = {
  id: string
  userId: string
  message: string
  createdAt: TimestampSource
  user?: { name: string; email: string }
}

type ProfileSource = {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  payeeName: string | null
  bankName: string | null
  payeeAccount: string | null
  createdAt: TimestampSource
}

type AchievementSource = AchievementDto
type AchievementUnlockSource = AchievementUnlockDto
type ProfileStatisticsSource = ProfileStatisticsDto

function toTimestamp(value: TimestampSource): string {
  if (typeof value === "string") {
    const calendarDate = /^(\d{4}-\d{2}-\d{2})(?:T|$)/.exec(value)?.[1]
    if (!calendarDate || !isValidCalendarDate(calendarDate)) {
      throw new Error("INVALID_RESPONSE_TIMESTAMP")
    }
  }
  const timestamp = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(timestamp.getTime())) throw new Error("INVALID_RESPONSE_TIMESTAMP")
  return timestamp.toISOString()
}

function toCurrencyDto(value: string): CurrencyDto {
  if (!isSupportedCurrency(value)) throw new Error("INVALID_RESPONSE_CURRENCY")
  return value
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function toActivityMetadataDto(activity: ActivitySource): Record<string, unknown> {
  const metadata = metadataObject(activity.metadata)
  const compact = (values: Record<string, unknown | undefined>) =>
    Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined))

  switch (activity.type) {
    case "EXPENSE_CREATED":
    case "EXPENSE_DELETED":
      return compact({
        title: optionalString(metadata.title),
        amount: optionalNumber(metadata.amount),
        currency: optionalString(metadata.currency),
      })
    case "EXPENSE_UPDATED":
      return compact({
        title: optionalString(metadata.title),
        amount: optionalNumber(metadata.amount),
        currency: optionalString(metadata.currency),
        changes: Array.isArray(metadata.changes)
          ? metadata.changes.filter((value): value is string => typeof value === "string")
          : undefined,
      })
    case "SETTLEMENT_CREATED":
      return compact({
        amount: optionalNumber(metadata.amount),
        currency: optionalString(metadata.currency),
        toUserName: optionalString(metadata.toUserName),
        cashFromUserName: optionalString(metadata.cashFromUserName),
      })
    case "SETTLEMENTS_RESET":
      return compact({ removed: optionalNumber(metadata.removed) })
    case "MEMBER_ADDED":
      return compact({
        memberName: optionalString(metadata.memberName),
        viaInvite: optionalBoolean(metadata.viaInvite),
      })
    case "MEMBER_REMOVED":
      return compact({
        memberName: optionalString(metadata.memberName),
        selfLeft: optionalBoolean(metadata.selfLeft),
      })
    case "GROUP_UPDATED":
      return compact({ name: optionalString(metadata.name) })
  }
}

function toUserSummaryDto(user: UserSummarySource): UserSummaryDto {
  return {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
  }
}

function toUserNameDto(user: UserNameSource): UserNameDto {
  return {
    id: user.id,
    name: user.name,
  }
}

function toGroupMemberUserDto(
  user: GroupMemberUserSource,
  includeRequisites: boolean
): GroupMemberUserDto {
  return {
    ...toUserSummaryDto(user),
    ...(includeRequisites && Object.hasOwn(user, "payeeName")
      ? { payeeName: user.payeeName ?? null }
      : {}),
    ...(includeRequisites && Object.hasOwn(user, "bankName")
      ? { bankName: user.bankName ?? null }
      : {}),
    ...(includeRequisites && Object.hasOwn(user, "payeeAccount")
      ? { payeeAccount: user.payeeAccount ?? null }
      : {}),
  }
}

function toGroupMemberDto(
  member: GroupMemberSource,
  includeRequisites: boolean
): GroupMemberDto {
  return {
    id: member.id,
    groupId: member.groupId,
    userId: member.userId,
    role: member.role,
    joinedAt: toTimestamp(member.joinedAt),
    isActive: member.isActive,
    payeeName: includeRequisites ? member.payeeName ?? null : null,
    bankName: includeRequisites ? member.bankName ?? null : null,
    payeeAccount: includeRequisites ? member.payeeAccount ?? null : null,
    user: toGroupMemberUserDto(member.user, includeRequisites),
  }
}

function toGroupDto(group: GroupSource, includeRequisites: boolean): GroupDto {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    type: group.type,
    currency: toCurrencyDto(group.currency),
    createdById: group.createdById,
    createdAt: toTimestamp(group.createdAt),
    updatedAt: toTimestamp(group.updatedAt),
    members: group.members.map((member) =>
      toGroupMemberDto(member, includeRequisites)
    ),
    ...(group._count ? { _count: { expenses: group._count.expenses } } : {}),
  }
}

function toExpenseDto(expense: ExpenseSource): ExpenseDto {
  return {
    id: expense.id,
    groupId: expense.groupId,
    paidById: expense.paidById,
    createdById: expense.createdById,
    title: expense.title,
    amount: expense.amount,
    currency: expense.currency,
    amountBase: expense.amountBase,
    customRate: expense.customRate === null || typeof expense.customRate === "number"
      ? expense.customRate
      : expense.customRate.toNumber(),
    category: expense.category,
    splitType: expense.splitType,
    date: toTimestamp(expense.date),
    notes: expense.notes,
    createdAt: toTimestamp(expense.createdAt),
    updatedAt: toTimestamp(expense.updatedAt),
    paidBy: toUserSummaryDto(expense.paidBy),
    createdBy: toUserSummaryDto(expense.createdBy),
    splits: expense.splits.map((split) => ({
      id: split.id,
      expenseId: split.expenseId,
      userId: split.userId,
      amount: split.amount,
      amountBase: split.amountBase,
      percentage: split.percentage,
      user: toUserSummaryDto(split.user),
    })),
    settlements: expense.settlements.map((settlement) => ({
      id: settlement.id,
      amount: settlement.amount,
      currency: settlement.currency,
      amountBase: settlement.amountBase,
      fromUser: toUserNameDto(settlement.fromUser),
    })),
  }
}

function toSettlementDto(settlement: SettlementSource): SettlementDto {
  return {
    id: settlement.id,
    groupId: settlement.groupId,
    expenseId: settlement.expenseId,
    fromUserId: settlement.fromUserId,
    toUserId: settlement.toUserId,
    amount: settlement.amount,
    currency: settlement.currency,
    amountBase: settlement.amountBase,
    date: toTimestamp(settlement.date),
    notes: settlement.notes,
    createdAt: toTimestamp(settlement.createdAt),
    fromUser: toUserSummaryDto(settlement.fromUser),
    toUser: toUserSummaryDto(settlement.toUser),
  }
}

function toFeedbackDto(feedback: FeedbackSource): FeedbackDto {
  return {
    id: feedback.id,
    userId: feedback.userId,
    message: feedback.message,
    createdAt: toTimestamp(feedback.createdAt),
    ...(feedback.user
      ? { user: { name: feedback.user.name, email: feedback.user.email } }
      : {}),
  }
}

function toGroupBalancesDto(balances: GroupBalancesDto): GroupBalancesDto {
  return {
    simplified: balances.simplified.map((debt) => ({
      fromUserId: debt.fromUserId,
      fromUserName: debt.fromUserName,
      toUserId: debt.toUserId,
      toUserName: debt.toUserName,
      amount: debt.amount,
    })),
    raw: balances.raw.map((balance) => ({
      userId: balance.userId,
      userName: balance.userName,
      balance: balance.balance,
    })),
  }
}

export function toGroupListResponse(result: {
  groups: GroupSource[]
  nextCursor: string | null
}): GroupListResponseDto {
  return {
    groups: result.groups.map((group) => toGroupDto(group, false)),
    nextCursor: result.nextCursor,
  }
}

export function toGroupResponse(group: GroupSource): GroupResponseDto {
  return { group: toGroupDto(group, false) }
}

export function toGroupDetailResponse(group: GroupSource): GroupResponseDto {
  return { group: toGroupDto(group, true) }
}

export function toGroupMemberResponse(member: GroupMemberSource): GroupMemberResponseDto {
  return { member: toGroupMemberDto(member, false) }
}

export function toExpenseResponse(expense: ExpenseSource): ExpenseResponseDto {
  return { expense: toExpenseDto(expense) }
}

export function toExpensePageResponse(result: {
  expenses: ExpenseSource[]
  nextCursor: string | null
}): ExpensePageResponseDto {
  return {
    expenses: result.expenses.map(toExpenseDto),
    nextCursor: result.nextCursor,
  }
}

export function toGroupBalancesResponse(
  balances: GroupBalancesDto
): GroupBalancesResponseDto {
  return { balances: toGroupBalancesDto(balances) }
}

export function toBalanceOverviewResponse(overview: BalanceOverviewDto): BalanceOverviewDto {
  return {
    totals: overview.totals.map((total) => ({
      currency: total.currency,
      owed: total.owed,
      owe: total.owe,
    })),
    friendBalances: overview.friendBalances.map((balance) => ({
      userId: balance.userId,
      userName: balance.userName,
      avatarUrl: balance.avatarUrl,
      balance: balance.balance,
      currency: balance.currency,
      groups: [...balance.groups],
    })),
  }
}

export function toSettlementResponse(settlement: SettlementSource): SettlementResponseDto {
  return { settlement: toSettlementDto(settlement) }
}

export function toSettlementListResponse(
  result: { settlements: SettlementSource[]; nextCursor: string | null }
): SettlementListResponseDto {
  return {
    settlements: result.settlements.map(toSettlementDto),
    nextCursor: result.nextCursor,
  }
}

export function toResetSettlementsResponse(
  result: ResetSettlementsResponseDto
): ResetSettlementsResponseDto {
  return { removed: result.removed }
}

export function toInviteTokenResponse(token: string): InviteTokenResponseDto {
  return { token }
}

export function toInviteInfoResponse(invite: InviteInfoDto): InviteInfoResponseDto {
  return {
    invite: {
      groupId: invite.groupId,
      groupName: invite.groupName,
      memberCount: invite.memberCount,
      isAlreadyMember: invite.isAlreadyMember,
    },
  }
}

export function toAcceptInviteResponse(groupId: string): AcceptInviteResponseDto {
  return { groupId }
}

export function toRequisitesResponse(requisites: RequisitesDto): RequisitesResponseDto {
  return {
    requisites: {
      payeeName: requisites.payeeName,
      bankName: requisites.bankName,
      payeeAccount: requisites.payeeAccount,
    },
  }
}

export function toActivityListResponse(activities: ActivitySource[]): ActivityListResponseDto {
  return {
    activities: activities.map(toActivityDto),
  }
}

function toActivityDto(activity: ActivitySource): ActivityDto {
  return {
    id: activity.id,
    groupId: activity.groupId,
    actorId: activity.actorId,
    type: activity.type,
    entityType: activity.entityType,
    entityId: activity.entityId,
    metadata: toActivityMetadataDto(activity),
    createdAt: toTimestamp(activity.createdAt),
    actor: toUserNameDto(activity.actor),
  }
}

export function toAccountActivityPageResponse(result: {
  activities: AccountActivitySource[]
  nextCursor: string | null
}): AccountActivityPageResponseDto {
  return {
    activities: result.activities.map((activity) => ({
      ...toActivityDto(activity),
      group: {
        id: activity.group.id,
        name: activity.group.name,
      },
    })),
    nextCursor: result.nextCursor,
  }
}

export function toFeedbackResponse(feedback: FeedbackSource): FeedbackResponseDto {
  return { feedback: toFeedbackDto(feedback) }
}

export function toFeedbackListResponse(feedbacks: FeedbackSource[]): FeedbackListResponseDto {
  return { feedbacks: feedbacks.map(toFeedbackDto) }
}

export function toProfileResponse(user: ProfileSource | null): ProfileResponseDto {
  return {
    user: user
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
          payeeName: user.payeeName,
          bankName: user.bankName,
          payeeAccount: user.payeeAccount,
          createdAt: toTimestamp(user.createdAt),
        }
      : null,
  }
}

export function toRegisterUserResponse(user: RegisteredUserDto): RegisterUserResponseDto {
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    },
  }
}

export function toUserSearchResponse(users: UserSummarySource[]): UserSearchResponseDto {
  return { users: users.map(toUserSummaryDto) }
}

function toAchievementDto(achievement: AchievementSource): AchievementDto {
  return {
    id: achievement.id,
    title: achievement.title,
    description: achievement.description,
    category: achievement.category,
    icon: achievement.icon,
    unlocked: achievement.unlocked,
    progress: achievement.progress,
    target: achievement.target,
    percent: achievement.percent,
    hidden: achievement.hidden,
  }
}

function toAchievementUnlockDto(unlock: AchievementUnlockSource): AchievementUnlockDto {
  return {
    id: unlock.id,
    title: unlock.title,
    description: unlock.description,
    icon: unlock.icon,
  }
}

export function toAchievementCollectionResponse(result: {
  summary: { unlocked: number; total: number }
  achievements: AchievementSource[]
}): AchievementCollectionResponseDto {
  return {
    summary: {
      unlocked: result.summary.unlocked,
      total: result.summary.total,
    },
    achievements: result.achievements.map(toAchievementDto),
  }
}

export function toAchievementUnlocksResponse(
  unlocked: AchievementUnlockSource[]
): AchievementUnlocksResponseDto {
  return { unlocked: unlocked.map(toAchievementUnlockDto) }
}

export function toProfileStatisticsResponse(
  statistics: ProfileStatisticsSource
): ProfileStatisticsResponseDto {
  return {
    statistics: {
      money: {
        spent: statistics.money.spent.map((total) => ({
          currency: total.currency,
          amount: total.amount,
        })),
        returned: statistics.money.returned.map((total) => ({
          currency: total.currency,
          amount: total.amount,
        })),
      },
      overview: {
        expensesParticipated: statistics.overview.expensesParticipated,
        expensesCreated: statistics.overview.expensesCreated,
        expensesPaid: statistics.overview.expensesPaid,
        activeGroups: statistics.overview.activeGroups,
      },
      splits: {
        equal: statistics.splits.equal,
        exact: statistics.splits.exact,
        percentage: statistics.splits.percentage,
      },
      collaboration: {
        uniquePeople: statistics.collaboration.uniquePeople,
        settlementsSent: statistics.collaboration.settlementsSent,
        settlementsReceived: statistics.collaboration.settlementsReceived,
        cashSettlements: statistics.collaboration.cashSettlements,
        invitesCreated: statistics.collaboration.invitesCreated,
        createdForOthers: statistics.collaboration.createdForOthers,
      },
      groups: {
        created: statistics.groups.created,
        home: statistics.groups.home,
        trip: statistics.groups.trip,
        couple: statistics.groups.couple,
        other: statistics.groups.other,
      },
      mastery: {
        currenciesUsed: statistics.mastery.currenciesUsed,
        splitMethodsUsed: statistics.mastery.splitMethodsUsed,
        customRates: statistics.mastery.customRates,
      },
      records: {
        maxExpenseParticipants: statistics.records.maxExpenseParticipants,
        maxPaidParticipants: statistics.records.maxPaidParticipants,
        maxGroupMembers: statistics.records.maxGroupMembers,
        maxGroupExpenses: statistics.records.maxGroupExpenses,
        accountAgeDays: statistics.records.accountAgeDays,
      },
    },
  }
}
