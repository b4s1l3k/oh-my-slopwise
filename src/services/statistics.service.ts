import type { AchievementMetrics } from "@/lib/achievements"
import { prisma } from "@/lib/db"
import { STATISTIC_KIND } from "@/services/statistics-history.service"

const DAY_MS = 24 * 60 * 60 * 1000

function maxBy<T>(items: T[], getValue: (item: T) => number) {
  let maximum = 0
  for (const item of items) maximum = Math.max(maximum, getValue(item))
  return maximum
}

/**
 * Current user statistics derived from source-of-truth operations.
 * Keeping these values live avoids a denormalized counters table drifting from
 * expenses after edits, settlement resets, member removal, or group deletion.
 */
export async function getCurrentUserStatistics(userId: string, now = new Date()): Promise<AchievementMetrics> {
  const [
    user,
    memberships,
    createdExpenses,
    expensesPaid,
    expensesParticipated,
    settlementsSent,
    settlementsReceived,
    cashSettlements,
    groupsCreated,
    invitesCreated,
    currencies,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        createdAt: true,
        payeeName: true,
        bankName: true,
        payeeAccount: true,
      },
    }),
    prisma.groupMember.findMany({
      where: { userId, isActive: true },
      select: {
        group: {
          select: {
            type: true,
            members: {
              where: { isActive: true },
              select: { userId: true },
            },
            _count: {
              select: {
                members: { where: { isActive: true } },
                expenses: true,
              },
            },
          },
        },
      },
    }),
    prisma.expense.findMany({
      where: { createdById: userId },
      select: {
        paidById: true,
        splitType: true,
        customRate: true,
        splits: { select: { userId: true } },
      },
    }),
    prisma.expense.count({ where: { paidById: userId } }),
    prisma.expenseSplit.count({ where: { userId } }),
    prisma.settlement.count({ where: { fromUserId: userId } }),
    prisma.settlement.count({ where: { toUserId: userId } }),
    prisma.settlement.count({
      where: { fromUserId: userId, expenseId: { not: null } },
    }),
    prisma.group.count({ where: { createdById: userId } }),
    prisma.groupInvite.count({ where: { createdById: userId } }),
    prisma.expense.findMany({
      where: {
        OR: [
          { createdById: userId },
          { paidById: userId },
          { splits: { some: { userId } } },
        ],
      },
      distinct: ["currency"],
      select: { currency: true },
    }),
  ])

  if (!user) throw new Error("User not found")

  const coMembers = new Set<string>()
  const groupTypes = new Set<string>()

  for (const membership of memberships) {
    groupTypes.add(membership.group.type)
    for (const member of membership.group.members) {
      if (member.userId !== userId) coMembers.add(member.userId)
    }
  }

  const countSplitType = (type: "EQUAL" | "EXACT" | "PERCENTAGE") =>
    createdExpenses.filter((expense) => expense.splitType === type).length

  const equalSplits = countSplitType("EQUAL")
  const exactSplits = countSplitType("EXACT")
  const percentageSplits = countSplitType("PERCENTAGE")

  return {
    accountAgeDays: Math.max(0, Math.floor((now.getTime() - user.createdAt.getTime()) / DAY_MS)),
    profileReady: Number(Boolean(user.payeeName && user.bankName && user.payeeAccount)),
    activeGroups: memberships.length,
    groupsCreated,
    invitesCreated,
    expensesCreated: createdExpenses.length,
    expensesParticipated,
    expensesPaid,
    createdForOthers: createdExpenses.filter((expense) => expense.paidById !== userId).length,
    uniquePeople: coMembers.size,
    maxExpenseParticipants: maxBy(createdExpenses, (expense) => expense.splits.length),
    maxPaidParticipants: maxBy(
      createdExpenses.filter((expense) => expense.paidById === userId),
      (expense) => expense.splits.length
    ),
    settlementsSent,
    settlementsReceived,
    cashSettlements,
    equalSplits,
    exactSplits,
    percentageSplits,
    splitMethodsUsed: [equalSplits, exactSplits, percentageSplits].filter((count) => count > 0).length,
    customRates: createdExpenses.filter((expense) => expense.customRate !== null).length,
    currenciesUsed: currencies.length,
    groupTypesUsed: groupTypes.size,
    homeGroups: memberships.filter((membership) => membership.group.type === "HOME").length,
    tripGroups: memberships.filter((membership) => membership.group.type === "TRIP").length,
    coupleGroups: memberships.filter((membership) => membership.group.type === "COUPLE").length,
    maxGroupMembers: maxBy(memberships, (membership) => membership.group._count.members),
    maxGroupExpenses: maxBy(memberships, (membership) => membership.group._count.expenses),
  }
}

export async function getHistoricalUserStatistics(
  userId: string,
  now = new Date()
): Promise<AchievementMetrics> {
  const [user, groupedFacts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        createdAt: true,
        payeeName: true,
        bankName: true,
        payeeAccount: true,
      },
    }),
    prisma.userStatisticFact.groupBy({
      by: ["kind"],
      where: { userId },
      _count: { _all: true },
      _max: { value: true },
    }),
  ])
  if (!user) throw new Error("User not found")

  const counts = new Map(groupedFacts.map((fact) => [fact.kind, fact._count._all]))
  const maxima = new Map(groupedFacts.map((fact) => [fact.kind, fact._max.value ?? 0]))
  const count = (kind: string) => counts.get(kind) ?? 0
  const maximum = (kind: string) => maxima.get(kind) ?? 0

  const homeGroups = count("GROUP_JOINED_HOME")
  const tripGroups = count("GROUP_JOINED_TRIP")
  const coupleGroups = count("GROUP_JOINED_COUPLE")
  const otherGroups = count("GROUP_JOINED_OTHER")
  const equalSplits = count("SPLIT_EQUAL")
  const exactSplits = count("SPLIT_EXACT")
  const percentageSplits = count("SPLIT_PERCENTAGE")

  return {
    accountAgeDays: Math.max(0, Math.floor((now.getTime() - user.createdAt.getTime()) / DAY_MS)),
    profileReady: Number(Boolean(user.payeeName && user.bankName && user.payeeAccount)),
    activeGroups: maximum(STATISTIC_KIND.activeGroupsRecord),
    groupsCreated: count(STATISTIC_KIND.groupCreated),
    invitesCreated: count(STATISTIC_KIND.inviteCreated),
    expensesCreated: count(STATISTIC_KIND.expenseCreated),
    expensesParticipated: count(STATISTIC_KIND.expenseParticipated),
    expensesPaid: count(STATISTIC_KIND.expensePaid),
    createdForOthers: count(STATISTIC_KIND.createdForOther),
    uniquePeople: count(STATISTIC_KIND.peer),
    maxExpenseParticipants: maximum(STATISTIC_KIND.expenseParticipantsRecord),
    maxPaidParticipants: maximum(STATISTIC_KIND.paidParticipantsRecord),
    settlementsSent: count(STATISTIC_KIND.settlementSent),
    settlementsReceived: count(STATISTIC_KIND.settlementReceived),
    cashSettlements: count(STATISTIC_KIND.cashSettlement),
    equalSplits,
    exactSplits,
    percentageSplits,
    splitMethodsUsed: [equalSplits, exactSplits, percentageSplits].filter((value) => value > 0).length,
    customRates: count(STATISTIC_KIND.customRate),
    currenciesUsed: count(STATISTIC_KIND.currency),
    groupTypesUsed: [homeGroups, tripGroups, coupleGroups, otherGroups].filter((value) => value > 0).length,
    homeGroups,
    tripGroups,
    coupleGroups,
    maxGroupMembers: maximum(STATISTIC_KIND.groupMembersRecord),
    maxGroupExpenses: maximum(STATISTIC_KIND.groupExpensesRecord),
  }
}

export function mergeHistoricalAndCurrentStatistics(
  historical: AchievementMetrics,
  current: AchievementMetrics
): AchievementMetrics {
  const merged = { ...historical }
  for (const key of Object.keys(merged) as Array<keyof AchievementMetrics>) {
    merged[key] = Math.max(historical[key], current[key])
  }
  return merged
}

// Kept as the current-data API for internal callers that explicitly need a live snapshot.
export const getUserStatistics = getCurrentUserStatistics
