import type { Prisma } from "@prisma/client"
import type { AchievementMetrics } from "@/lib/achievements"
import { prisma } from "@/lib/db"
import { STATISTIC_KIND } from "@/services/statistics-history.service"
import type { UserMoneyStatistics } from "@/lib/statistics"

const DAY_MS = 24 * 60 * 60 * 1000

type StatisticsReader = Pick<
  Prisma.TransactionClient,
  | "user"
  | "userStatisticMetric"
  | "userStatisticCurrency"
  | "userStatisticMoney"
>

function toSafeStatisticNumber(value: bigint, field: string): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) throw new Error(`${field}_OUT_OF_RANGE`)
  return number
}

export async function getHistoricalUserStatistics(
  userId: string,
  now = new Date(),
  db: StatisticsReader = prisma
): Promise<AchievementMetrics> {
  const [user, metrics, currenciesUsed] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        createdAt: true,
        payeeName: true,
        bankName: true,
        payeeAccount: true,
      },
    }),
    db.userStatisticMetric.findMany({
      where: { userId },
      select: { kind: true, factCount: true, maxValue: true },
    }),
    db.userStatisticCurrency.count({ where: { userId } }),
  ])
  if (!user) throw new Error("User not found")

  const counts = new Map(metrics.map((metric) => [
    metric.kind,
    toSafeStatisticNumber(metric.factCount, "STATISTIC_COUNT"),
  ]))
  const maxima = new Map(metrics.map((metric) => [metric.kind, metric.maxValue]))
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
    coffeeExpensesPaid: count(STATISTIC_KIND.coffeePaid),
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
    currenciesUsed,
    groupTypesUsed: [homeGroups, tripGroups, coupleGroups, otherGroups].filter((value) => value > 0).length,
    homeGroups,
    tripGroups,
    coupleGroups,
    otherGroups,
    maxGroupMembers: maximum(STATISTIC_KIND.groupMembersRecord),
    maxGroupExpenses: maximum(STATISTIC_KIND.groupExpensesRecord),
  }
}

export async function getHistoricalUserMoneyStatistics(
  userId: string,
  db: StatisticsReader = prisma
): Promise<UserMoneyStatistics> {
  const totalsByCurrency = await db.userStatisticMoney.findMany({
    where: {
      userId,
      kind: { in: [STATISTIC_KIND.moneySpent, STATISTIC_KIND.moneyReturned] },
    },
    select: { kind: true, currency: true, totalValue: true },
  })

  const totals = (kind: string) => totalsByCurrency
    .filter((total) => total.kind === kind)
    .map((total) => ({
      currency: total.currency,
      amount: toSafeStatisticNumber(total.totalValue, "STATISTIC_MONEY"),
    }))
    .sort((left, right) => left.currency.localeCompare(right.currency))

  return {
    spent: totals(STATISTIC_KIND.moneySpent),
    returned: totals(STATISTIC_KIND.moneyReturned),
  }
}

export async function getHistoricalUserStatisticsSnapshot(
  userId: string,
  now = new Date()
): Promise<{ metrics: AchievementMetrics; money: UserMoneyStatistics }> {
  return prisma.$transaction(async (tx) => {
    const [metrics, money] = await Promise.all([
      getHistoricalUserStatistics(userId, now, tx),
      getHistoricalUserMoneyStatistics(userId, tx),
    ])
    return { metrics, money }
  }, { isolationLevel: "RepeatableRead" })
}
