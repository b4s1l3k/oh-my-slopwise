import type { AchievementMetrics } from "@/lib/achievements"

export type ProfileStatistics = {
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

export function buildProfileStatistics(metrics: AchievementMetrics): ProfileStatistics {
  return {
    overview: {
      expensesParticipated: metrics.expensesParticipated,
      expensesCreated: metrics.expensesCreated,
      expensesPaid: metrics.expensesPaid,
      activeGroups: metrics.activeGroups,
    },
    splits: {
      equal: metrics.equalSplits,
      exact: metrics.exactSplits,
      percentage: metrics.percentageSplits,
    },
    collaboration: {
      uniquePeople: metrics.uniquePeople,
      settlementsSent: metrics.settlementsSent,
      settlementsReceived: metrics.settlementsReceived,
      cashSettlements: metrics.cashSettlements,
      invitesCreated: metrics.invitesCreated,
      createdForOthers: metrics.createdForOthers,
    },
    groups: {
      created: metrics.groupsCreated,
      home: metrics.homeGroups,
      trip: metrics.tripGroups,
      couple: metrics.coupleGroups,
      other: Math.max(
        0,
        metrics.activeGroups - metrics.homeGroups - metrics.tripGroups - metrics.coupleGroups
      ),
    },
    mastery: {
      currenciesUsed: metrics.currenciesUsed,
      splitMethodsUsed: metrics.splitMethodsUsed,
      customRates: metrics.customRates,
    },
    records: {
      maxExpenseParticipants: metrics.maxExpenseParticipants,
      maxPaidParticipants: metrics.maxPaidParticipants,
      maxGroupMembers: metrics.maxGroupMembers,
      maxGroupExpenses: metrics.maxGroupExpenses,
      accountAgeDays: metrics.accountAgeDays,
    },
  }
}
