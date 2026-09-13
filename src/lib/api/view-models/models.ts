import type { SupportedCurrency } from "@/lib/currencies"

export type GroupTypeViewModel = "HOME" | "TRIP" | "COUPLE" | "OTHER"
export type GroupRoleViewModel = "ADMIN" | "MEMBER"
export type ExpenseSplitTypeViewModel = "EQUAL" | "EXACT" | "PERCENTAGE"
export type AchievementCategoryViewModel =
  | "START"
  | "ACTIVITY"
  | "TEAM"
  | "SETTLEMENTS"
  | "MASTERY"
  | "GROUPS"

export type UserSummaryViewModel = {
  id: string
  name: string
  avatarUrl: string | null
}

export type UserNameViewModel = {
  id: string
  name: string
}

export type RequisitesViewModel = {
  payeeName: string | null
  bankName: string | null
  payeeAccount: string | null
}

export type GroupMemberUserViewModel = UserSummaryViewModel & RequisitesViewModel

export type GroupMemberViewModel = RequisitesViewModel & {
  id: string
  groupId: string
  userId: string
  role: GroupRoleViewModel
  joinedAt: string
  isActive: boolean
  user: GroupMemberUserViewModel
}

export type GroupViewModel = {
  id: string
  name: string
  description: string | null
  type: GroupTypeViewModel
  currency: SupportedCurrency
  createdById: string
  createdAt: string
  updatedAt: string
  members: GroupMemberViewModel[]
  expenseCount: number | null
}

export type ExpenseSplitViewModel = {
  id: string
  expenseId: string
  userId: string
  amount: number
  amountBase: number | null
  share: number | null
  percentage: number | null
  user: UserSummaryViewModel
}

export type ExpenseCashSettlementViewModel = {
  id: string
  amount: number
  currency: string
  amountBase: number | null
  fromUser: UserNameViewModel
}

export type ExpenseViewModel = {
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
  splitType: ExpenseSplitTypeViewModel
  date: string
  notes: string | null
  createdAt: string
  updatedAt: string
  paidBy: UserSummaryViewModel
  createdBy: UserSummaryViewModel
  splits: ExpenseSplitViewModel[]
  settlements: ExpenseCashSettlementViewModel[]
}

export type ExpensePageViewModel = {
  expenses: ExpenseViewModel[]
  total: number
  hasNext: boolean
}

export type SettlementViewModel = {
  id: string
  groupId: string | null
  expenseId: string | null
  fromUserId: string
  toUserId: string
  amount: number
  currency: string
  amountBase: number | null
  date: string
  notes: string | null
  createdAt: string
  fromUser: UserSummaryViewModel
  toUser: UserSummaryViewModel
}

export type SimplifiedDebtViewModel = {
  fromUserId: string
  fromUserName: string
  toUserId: string
  toUserName: string
  amount: number
}

export type UserBalanceViewModel = {
  userId: string
  userName: string
  balance: number
}

export type GroupBalancesViewModel = {
  simplified: SimplifiedDebtViewModel[]
  raw: UserBalanceViewModel[]
}

export type CurrencyTotalViewModel = {
  currency: string
  owed: number
  owe: number
}

export type FriendBalanceViewModel = {
  userId: string
  userName: string
  avatarUrl: string | null
  balance: number
  currency: string
  groups: string[]
}

export type BalanceOverviewViewModel = {
  totals: CurrencyTotalViewModel[]
  friendBalances: FriendBalanceViewModel[]
}

export type InviteViewModel = {
  groupId: string
  groupName: string
  memberCount: number
  isAlreadyMember: boolean
}

export type ProfileViewModel = RequisitesViewModel & {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  createdAt: string
}

export type RegisteredUserViewModel = {
  id: string
  name: string
  email: string
  avatarUrl: string | null
}

export type ActivityMetadataViewModel = {
  title?: string
  amount?: number
  currency?: string
  toUserName?: string
  cashFromUserName?: string
  memberName?: string
  selfLeft?: boolean
  viaInvite?: boolean
  name?: string
  changes?: string[]
  removed?: number
}

export type ActivityTypeViewModel =
  | "EXPENSE_CREATED"
  | "EXPENSE_UPDATED"
  | "EXPENSE_DELETED"
  | "SETTLEMENT_CREATED"
  | "SETTLEMENTS_RESET"
  | "MEMBER_ADDED"
  | "MEMBER_REMOVED"
  | "GROUP_UPDATED"

export type ActivityItemViewModel = {
  id: string
  groupId: string | null
  actorId: string
  type: ActivityTypeViewModel
  entityType: string
  entityId: string
  metadata: ActivityMetadataViewModel
  createdAt: string
  actor: UserNameViewModel
}

export type GroupActivityViewModel = {
  id: string
  name: string
  activities: ActivityItemViewModel[]
}

export type FeedbackViewModel = {
  id: string
  userId: string
  message: string
  createdAt: string
}

export type AdminFeedbackViewModel = FeedbackViewModel & {
  user: {
    name: string
    email: string
  }
}

export type AchievementViewModel = {
  id: string
  title: string
  description: string
  category: AchievementCategoryViewModel
  icon: string
  unlocked: boolean
  progress: number
  target: number
  percent: number
  hidden: boolean
}

export type AchievementUnlockViewModel = {
  id: string
  title: string
  description: string
  icon: string
}

export type AchievementCollectionViewModel = {
  summary: {
    unlocked: number
    total: number
  }
  achievements: AchievementViewModel[]
}

export type MoneyTotalViewModel = {
  currency: string
  amount: number
}

export type ProfileStatisticsViewModel = {
  money: {
    spent: MoneyTotalViewModel[]
    returned: MoneyTotalViewModel[]
  }
  overview: {
    expensesParticipated: number
    expensesCreated: number
    expensesPaid: number
    activeGroups: number
  }
  splits: {
    equal: number
    exact: number
    percentage: number
  }
  collaboration: {
    uniquePeople: number
    settlementsSent: number
    settlementsReceived: number
    cashSettlements: number
    invitesCreated: number
    createdForOthers: number
  }
  groups: {
    created: number
    home: number
    trip: number
    couple: number
    other: number
  }
  mastery: {
    currenciesUsed: number
    splitMethodsUsed: number
    customRates: number
  }
  records: {
    maxExpenseParticipants: number
    maxPaidParticipants: number
    maxGroupMembers: number
    maxGroupExpenses: number
    accountAgeDays: number
  }
}
