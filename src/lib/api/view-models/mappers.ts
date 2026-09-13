import type {
  AchievementCollectionResponseDto,
  AchievementDto,
  AchievementUnlockDto,
  ActivityDto,
  BalanceOverviewDto,
  ExpenseCashSettlementDto,
  ExpenseDto,
  ExpensePageResponseDto,
  ExpenseSplitDto,
  FeedbackDto,
  FriendBalanceDto,
  GroupBalancesDto,
  GroupDto,
  GroupMemberDto,
  GroupMemberUserDto,
  InviteInfoDto,
  ProfileDto,
  ProfileStatisticsDto,
  RegisteredUserDto,
  RequisitesDto,
  SettlementDto,
  SimplifiedDebtDto,
  UserBalanceDto,
  UserNameDto,
  UserSummaryDto,
} from "@/lib/api/v1/response-dtos"
import type {
  AchievementCollectionViewModel,
  AchievementUnlockViewModel,
  AchievementViewModel,
  ActivityItemViewModel,
  AdminFeedbackViewModel,
  BalanceOverviewViewModel,
  ExpenseCashSettlementViewModel,
  ExpensePageViewModel,
  ExpenseSplitViewModel,
  ExpenseViewModel,
  FeedbackViewModel,
  FriendBalanceViewModel,
  GroupBalancesViewModel,
  GroupMemberUserViewModel,
  GroupMemberViewModel,
  GroupViewModel,
  InviteViewModel,
  ProfileStatisticsViewModel,
  ProfileViewModel,
  RegisteredUserViewModel,
  RequisitesViewModel,
  SettlementViewModel,
  SimplifiedDebtViewModel,
  UserBalanceViewModel,
  UserNameViewModel,
  UserSummaryViewModel,
} from "@/lib/api/view-models/models"

export function mapUserSummaryViewModel(dto: UserSummaryDto): UserSummaryViewModel {
  return {
    id: dto.id,
    name: dto.name,
    avatarUrl: dto.avatarUrl,
  }
}

export function mapUserNameViewModel(dto: UserNameDto): UserNameViewModel {
  return {
    id: dto.id,
    name: dto.name,
  }
}

function mapGroupMemberUserViewModel(dto: GroupMemberUserDto): GroupMemberUserViewModel {
  return {
    id: dto.id,
    name: dto.name,
    avatarUrl: dto.avatarUrl,
    payeeName: dto.payeeName ?? null,
    bankName: dto.bankName ?? null,
    payeeAccount: dto.payeeAccount ?? null,
  }
}

export function mapRequisitesViewModel(dto: RequisitesDto): RequisitesViewModel {
  return {
    payeeName: dto.payeeName,
    bankName: dto.bankName,
    payeeAccount: dto.payeeAccount,
  }
}

export function mapGroupMemberViewModel(dto: GroupMemberDto): GroupMemberViewModel {
  return {
    id: dto.id,
    groupId: dto.groupId,
    userId: dto.userId,
    role: dto.role,
    joinedAt: dto.joinedAt,
    isActive: dto.isActive,
    payeeName: dto.payeeName,
    bankName: dto.bankName,
    payeeAccount: dto.payeeAccount,
    user: mapGroupMemberUserViewModel(dto.user),
  }
}

export function mapGroupViewModel(dto: GroupDto): GroupViewModel {
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description,
    type: dto.type,
    currency: dto.currency,
    createdById: dto.createdById,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    members: dto.members.map(mapGroupMemberViewModel),
    expenseCount: dto._count?.expenses ?? null,
  }
}

function mapExpenseSplitViewModel(dto: ExpenseSplitDto): ExpenseSplitViewModel {
  return {
    id: dto.id,
    expenseId: dto.expenseId,
    userId: dto.userId,
    amount: dto.amount,
    amountBase: dto.amountBase,
    share: dto.share,
    percentage: dto.percentage,
    user: mapUserSummaryViewModel(dto.user),
  }
}

function mapExpenseCashSettlementViewModel(
  dto: ExpenseCashSettlementDto
): ExpenseCashSettlementViewModel {
  return {
    id: dto.id,
    amount: dto.amount,
    currency: dto.currency,
    amountBase: dto.amountBase,
    fromUser: mapUserNameViewModel(dto.fromUser),
  }
}

export function mapExpenseViewModel(dto: ExpenseDto): ExpenseViewModel {
  return {
    id: dto.id,
    groupId: dto.groupId,
    paidById: dto.paidById,
    createdById: dto.createdById,
    title: dto.title,
    amount: dto.amount,
    currency: dto.currency,
    amountBase: dto.amountBase,
    customRate: dto.customRate,
    category: dto.category,
    splitType: dto.splitType,
    date: dto.date,
    notes: dto.notes,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    paidBy: mapUserSummaryViewModel(dto.paidBy),
    createdBy: mapUserSummaryViewModel(dto.createdBy),
    splits: dto.splits.map(mapExpenseSplitViewModel),
    settlements: dto.settlements.map(mapExpenseCashSettlementViewModel),
  }
}

export function mapExpensePageViewModel(dto: ExpensePageResponseDto): ExpensePageViewModel {
  return {
    expenses: dto.expenses.map(mapExpenseViewModel),
    total: dto.total,
    hasNext: dto.hasNext,
  }
}

export function mapSettlementViewModel(dto: SettlementDto): SettlementViewModel {
  return {
    id: dto.id,
    groupId: dto.groupId,
    expenseId: dto.expenseId,
    fromUserId: dto.fromUserId,
    toUserId: dto.toUserId,
    amount: dto.amount,
    currency: dto.currency,
    amountBase: dto.amountBase,
    date: dto.date,
    notes: dto.notes,
    createdAt: dto.createdAt,
    fromUser: mapUserSummaryViewModel(dto.fromUser),
    toUser: mapUserSummaryViewModel(dto.toUser),
  }
}

function mapSimplifiedDebtViewModel(dto: SimplifiedDebtDto): SimplifiedDebtViewModel {
  return {
    fromUserId: dto.fromUserId,
    fromUserName: dto.fromUserName,
    toUserId: dto.toUserId,
    toUserName: dto.toUserName,
    amount: dto.amount,
  }
}

function mapUserBalanceViewModel(dto: UserBalanceDto): UserBalanceViewModel {
  return {
    userId: dto.userId,
    userName: dto.userName,
    balance: dto.balance,
  }
}

export function mapGroupBalancesViewModel(dto: GroupBalancesDto): GroupBalancesViewModel {
  return {
    simplified: dto.simplified.map(mapSimplifiedDebtViewModel),
    raw: dto.raw.map(mapUserBalanceViewModel),
  }
}

function mapFriendBalanceViewModel(dto: FriendBalanceDto): FriendBalanceViewModel {
  return {
    userId: dto.userId,
    userName: dto.userName,
    avatarUrl: dto.avatarUrl,
    balance: dto.balance,
    currency: dto.currency,
    groups: [...dto.groups],
  }
}

export function mapBalanceOverviewViewModel(dto: BalanceOverviewDto): BalanceOverviewViewModel {
  return {
    totals: dto.totals.map((total) => ({
      currency: total.currency,
      owed: total.owed,
      owe: total.owe,
    })),
    friendBalances: dto.friendBalances.map(mapFriendBalanceViewModel),
  }
}

export function mapInviteViewModel(dto: InviteInfoDto): InviteViewModel {
  return {
    groupId: dto.groupId,
    groupName: dto.groupName,
    memberCount: dto.memberCount,
    isAlreadyMember: dto.isAlreadyMember,
  }
}

export function mapProfileViewModel(dto: ProfileDto): ProfileViewModel {
  return {
    id: dto.id,
    name: dto.name,
    email: dto.email,
    avatarUrl: dto.avatarUrl,
    payeeName: dto.payeeName,
    bankName: dto.bankName,
    payeeAccount: dto.payeeAccount,
    createdAt: dto.createdAt,
  }
}

export function mapRegisteredUserViewModel(dto: RegisteredUserDto): RegisteredUserViewModel {
  return {
    id: dto.id,
    name: dto.name,
    email: dto.email,
    avatarUrl: dto.avatarUrl,
  }
}

export function mapActivityItemViewModel(dto: ActivityDto): ActivityItemViewModel {
  const metadata = dto.metadata
  return {
    id: dto.id,
    groupId: dto.groupId,
    actorId: dto.actorId,
    type: dto.type,
    entityType: dto.entityType,
    entityId: dto.entityId,
    createdAt: dto.createdAt,
    actor: mapUserNameViewModel(dto.actor),
    metadata: {
      title: typeof metadata.title === "string" ? metadata.title : undefined,
      amount: typeof metadata.amount === "number" ? metadata.amount : undefined,
      currency: typeof metadata.currency === "string" ? metadata.currency : undefined,
      toUserName: typeof metadata.toUserName === "string" ? metadata.toUserName : undefined,
      cashFromUserName:
        typeof metadata.cashFromUserName === "string" ? metadata.cashFromUserName : undefined,
      memberName: typeof metadata.memberName === "string" ? metadata.memberName : undefined,
      selfLeft: typeof metadata.selfLeft === "boolean" ? metadata.selfLeft : undefined,
      viaInvite: typeof metadata.viaInvite === "boolean" ? metadata.viaInvite : undefined,
      name: typeof metadata.name === "string" ? metadata.name : undefined,
      changes: Array.isArray(metadata.changes)
        ? metadata.changes.filter((change): change is string => typeof change === "string")
        : undefined,
      removed: typeof metadata.removed === "number" ? metadata.removed : undefined,
    },
  }
}

export function mapFeedbackViewModel(dto: FeedbackDto): FeedbackViewModel {
  return {
    id: dto.id,
    userId: dto.userId,
    message: dto.message,
    createdAt: dto.createdAt,
  }
}

export function mapAdminFeedbackViewModel(dto: FeedbackDto): AdminFeedbackViewModel {
  if (!dto.user) throw new Error("Admin feedback response is missing its user")
  return {
    id: dto.id,
    userId: dto.userId,
    message: dto.message,
    createdAt: dto.createdAt,
    user: {
      name: dto.user.name,
      email: dto.user.email,
    },
  }
}

function mapAchievementViewModel(dto: AchievementDto): AchievementViewModel {
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description,
    category: dto.category,
    icon: dto.icon,
    unlocked: dto.unlocked,
    progress: dto.progress,
    target: dto.target,
    percent: dto.percent,
    hidden: dto.hidden,
  }
}

export function mapAchievementUnlockViewModel(
  dto: AchievementUnlockDto
): AchievementUnlockViewModel {
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description,
    icon: dto.icon,
  }
}

export function mapAchievementCollectionViewModel(
  dto: AchievementCollectionResponseDto
): AchievementCollectionViewModel {
  return {
    summary: {
      unlocked: dto.summary.unlocked,
      total: dto.summary.total,
    },
    achievements: dto.achievements.map(mapAchievementViewModel),
  }
}

export function mapProfileStatisticsViewModel(
  dto: ProfileStatisticsDto
): ProfileStatisticsViewModel {
  return {
    money: {
      spent: dto.money.spent.map((total) => ({
        currency: total.currency,
        amount: total.amount,
      })),
      returned: dto.money.returned.map((total) => ({
        currency: total.currency,
        amount: total.amount,
      })),
    },
    overview: {
      expensesParticipated: dto.overview.expensesParticipated,
      expensesCreated: dto.overview.expensesCreated,
      expensesPaid: dto.overview.expensesPaid,
      activeGroups: dto.overview.activeGroups,
    },
    splits: {
      equal: dto.splits.equal,
      exact: dto.splits.exact,
      percentage: dto.splits.percentage,
    },
    collaboration: {
      uniquePeople: dto.collaboration.uniquePeople,
      settlementsSent: dto.collaboration.settlementsSent,
      settlementsReceived: dto.collaboration.settlementsReceived,
      cashSettlements: dto.collaboration.cashSettlements,
      invitesCreated: dto.collaboration.invitesCreated,
      createdForOthers: dto.collaboration.createdForOthers,
    },
    groups: {
      created: dto.groups.created,
      home: dto.groups.home,
      trip: dto.groups.trip,
      couple: dto.groups.couple,
      other: dto.groups.other,
    },
    mastery: {
      currenciesUsed: dto.mastery.currenciesUsed,
      splitMethodsUsed: dto.mastery.splitMethodsUsed,
      customRates: dto.mastery.customRates,
    },
    records: {
      maxExpenseParticipants: dto.records.maxExpenseParticipants,
      maxPaidParticipants: dto.records.maxPaidParticipants,
      maxGroupMembers: dto.records.maxGroupMembers,
      maxGroupExpenses: dto.records.maxGroupExpenses,
      accountAgeDays: dto.records.accountAgeDays,
    },
  }
}
