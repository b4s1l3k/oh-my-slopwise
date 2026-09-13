import type { SupportedCurrency } from "@/lib/currencies"

export type TimestampDto = string

export type CurrencyDto = SupportedCurrency

export type UserSummaryDto = {
  id: string
  name: string
  avatarUrl: string | null
}

export type UserNameDto = Pick<UserSummaryDto, "id" | "name">

export type GroupMemberUserDto = UserSummaryDto & {
  payeeName?: string | null
  bankName?: string | null
  payeeAccount?: string | null
}

export type ProfileDto = {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  payeeName: string | null
  bankName: string | null
  payeeAccount: string | null
  createdAt: TimestampDto
}

export type RegisteredUserDto = Pick<ProfileDto, "id" | "email" | "name" | "avatarUrl">

export type GroupMemberDto = {
  id: string
  groupId: string
  userId: string
  role: "ADMIN" | "MEMBER"
  joinedAt: TimestampDto
  isActive: boolean
  payeeName: string | null
  bankName: string | null
  payeeAccount: string | null
  user: GroupMemberUserDto
}

export type GroupDto = {
  id: string
  name: string
  description: string | null
  type: "HOME" | "TRIP" | "COUPLE" | "OTHER"
  currency: CurrencyDto
  createdById: string
  createdAt: TimestampDto
  updatedAt: TimestampDto
  members: GroupMemberDto[]
  _count?: { expenses: number }
}

export type ExpenseSplitDto = {
  id: string
  expenseId: string
  userId: string
  amount: number
  amountBase: number | null
  share: number | null
  percentage: number | null
  user: UserSummaryDto
}

export type ExpenseCashSettlementDto = {
  id: string
  amount: number
  currency: string
  amountBase: number | null
  fromUser: UserNameDto
}

export type ExpenseDto = {
  id: string
  groupId: string
  paidById: string
  createdById: string
  title: string
  amount: number
  currency: string
  amountBase: number | null
  customRate: number | null
  category: string | null
  splitType: "EQUAL" | "EXACT" | "PERCENTAGE"
  date: TimestampDto
  notes: string | null
  createdAt: TimestampDto
  updatedAt: TimestampDto
  paidBy: UserSummaryDto
  createdBy: UserSummaryDto
  splits: ExpenseSplitDto[]
  settlements: ExpenseCashSettlementDto[]
}

export type SettlementDto = {
  id: string
  groupId: string | null
  expenseId: string | null
  fromUserId: string
  toUserId: string
  amount: number
  currency: string
  amountBase: number | null
  date: TimestampDto
  notes: string | null
  createdAt: TimestampDto
  fromUser: UserSummaryDto
  toUser: UserSummaryDto
}

export type ActivityDto = {
  id: string
  groupId: string | null
  actorId: string
  type:
    | "EXPENSE_CREATED"
    | "EXPENSE_UPDATED"
    | "EXPENSE_DELETED"
    | "SETTLEMENT_CREATED"
    | "SETTLEMENTS_RESET"
    | "MEMBER_ADDED"
    | "MEMBER_REMOVED"
    | "GROUP_UPDATED"
  entityType: string
  entityId: string
  metadata: Record<string, unknown>
  createdAt: TimestampDto
  actor: UserNameDto
}

export type FeedbackDto = {
  id: string
  userId: string
  message: string
  createdAt: TimestampDto
  user?: {
    name: string
    email: string
  }
}

export type SimplifiedDebtDto = {
  fromUserId: string
  fromUserName: string
  toUserId: string
  toUserName: string
  amount: number
}

export type UserBalanceDto = {
  userId: string
  userName: string
  balance: number
}

export type GroupBalancesDto = {
  simplified: SimplifiedDebtDto[]
  raw: UserBalanceDto[]
}

export type CurrencyTotalDto = {
  currency: string
  owed: number
  owe: number
}

export type FriendBalanceDto = {
  userId: string
  userName: string
  avatarUrl: string | null
  balance: number
  currency: string
  groups: string[]
}

export type BalanceOverviewDto = {
  totals: CurrencyTotalDto[]
  friendBalances: FriendBalanceDto[]
}

export type InviteInfoDto = {
  groupId: string
  groupName: string
  memberCount: number
  isAlreadyMember: boolean
}

export type RequisitesDto = {
  payeeName: string | null
  bankName: string | null
  payeeAccount: string | null
}

export type AchievementDto = {
  id: string
  title: string
  description: string
  category: "START" | "ACTIVITY" | "TEAM" | "SETTLEMENTS" | "MASTERY" | "GROUPS"
  icon: string
  unlocked: boolean
  progress: number
  target: number
  percent: number
  hidden: boolean
}

export type AchievementUnlockDto = Pick<
  AchievementDto,
  "id" | "title" | "description" | "icon"
>

export type ProfileStatisticsDto = {
  money: {
    spent: Array<{ currency: string; amount: number }>
    returned: Array<{ currency: string; amount: number }>
  }
  overview: {
    expensesParticipated: number
    expensesCreated: number
    expensesPaid: number
    activeGroups: number
  }
  splits: { equal: number; exact: number; percentage: number }
  collaboration: {
    uniquePeople: number
    settlementsSent: number
    settlementsReceived: number
    cashSettlements: number
    invitesCreated: number
    createdForOthers: number
  }
  groups: { created: number; home: number; trip: number; couple: number; other: number }
  mastery: { currenciesUsed: number; splitMethodsUsed: number; customRates: number }
  records: {
    maxExpenseParticipants: number
    maxPaidParticipants: number
    maxGroupMembers: number
    maxGroupExpenses: number
    accountAgeDays: number
  }
}

export type GroupListResponseDto = { groups: GroupDto[] }
export type GroupResponseDto = { group: GroupDto }
export type GroupMemberResponseDto = { member: GroupMemberDto }
export type ExpenseResponseDto = { expense: ExpenseDto }
export type ExpensePageResponseDto = { expenses: ExpenseDto[]; total: number; hasNext: boolean }
export type GroupBalancesResponseDto = { balances: GroupBalancesDto }
export type SettlementResponseDto = { settlement: SettlementDto }
export type SettlementListResponseDto = { settlements: SettlementDto[] }
export type ResetSettlementsResponseDto = { removed: number }
export type InviteTokenResponseDto = { token: string }
export type InviteInfoResponseDto = { invite: InviteInfoDto }
export type AcceptInviteResponseDto = { groupId: string }
export type RequisitesResponseDto = { requisites: RequisitesDto }
export type ActivityListResponseDto = { activities: ActivityDto[] }
export type FeedbackResponseDto = { feedback: FeedbackDto }
export type FeedbackListResponseDto = { feedbacks: FeedbackDto[] }
export type ProfileResponseDto = { user: ProfileDto | null }
export type RegisterUserResponseDto = { user: RegisteredUserDto }
export type UserSearchResponseDto = { users: UserSummaryDto[] }
export type AchievementCollectionResponseDto = {
  summary: { unlocked: number; total: number }
  achievements: AchievementDto[]
}
export type AchievementUnlocksResponseDto = { unlocked: AchievementUnlockDto[] }
export type ProfileStatisticsResponseDto = { statistics: ProfileStatisticsDto }
