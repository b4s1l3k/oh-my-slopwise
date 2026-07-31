import { evaluateAchievements, type AchievementMetrics } from "@/lib/achievements"
import { prisma } from "@/lib/db"

const DAY_MS = 24 * 60 * 60 * 1000

function maxBy<T>(items: T[], getValue: (item: T) => number) {
  let maximum = 0
  for (const item of items) maximum = Math.max(maximum, getValue(item))
  return maximum
}

export async function getUserAchievements(userId: string, now = new Date()) {
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

  const metrics: AchievementMetrics = {
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

  const achievements = evaluateAchievements(metrics)
  const unlocked = achievements.filter((achievement) => achievement.unlocked).length

  return {
    summary: { unlocked, total: achievements.length },
    achievements,
  }
}
