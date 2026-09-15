import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import { createExpense, deleteExpense, updateExpense } from "@/services/expenses.service"
import { createGroup } from "@/services/groups.service"
import { createSettlement, resetSettlements } from "@/services/settlements.service"

const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === "true"
const describeDatabase = runDatabaseTests ? describe : describe.skip
const testPrefix = `persistence-projections-${Date.now()}`
const operationDate = "2028-07-19"
const ZERO = BigInt(0)
const ONE = BigInt(1)

let userSequence = 0
async function createUser(name: string) {
  userSequence += 1
  return prisma.user.create({
    data: {
      email: `${testPrefix}-${userSequence}@example.test`,
      name,
      passwordHash: "test-only",
    },
  })
}

async function expectBalanceProjectionMatchesSource(groupId: string) {
  const [expenses, settlements, positions] = await Promise.all([
    prisma.expense.findMany({
      where: { groupId },
      select: {
        paidById: true,
        amountBase: true,
        splits: { select: { userId: true, amountBase: true } },
      },
    }),
    prisma.settlement.findMany({
      where: { groupId },
      select: { fromUserId: true, toUserId: true, amountBase: true },
    }),
    prisma.groupMemberPosition.findMany({
      where: { groupId },
      select: { userId: true, balance: true },
      orderBy: { userId: "asc" },
    }),
  ])

  const expected = new Map<string, bigint>()
  const adjust = (userId: string, delta: bigint) => {
    expected.set(userId, (expected.get(userId) ?? ZERO) + delta)
  }
  for (const expense of expenses) {
    adjust(expense.paidById, BigInt(expense.amountBase))
    for (const split of expense.splits) adjust(split.userId, -BigInt(split.amountBase))
  }
  for (const settlement of settlements) {
    adjust(settlement.fromUserId, BigInt(settlement.amountBase))
    adjust(settlement.toUserId, -BigInt(settlement.amountBase))
  }

  expect(positions.filter((position) => position.balance !== ZERO).map((position) => ({
    userId: position.userId,
    balance: position.balance,
  }))).toEqual(
    [...expected.entries()]
      .filter(([, balance]) => balance !== ZERO)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([userId, balance]) => ({ userId, balance }))
  )
  expect(positions.reduce((sum, position) => sum + position.balance, ZERO)).toBe(ZERO)
}

async function expectStatisticProjectionsMatchSource(userIds: string[]) {
  for (const userId of userIds) {
    const [facts, metrics, currencies, money] = await Promise.all([
      prisma.userStatisticFact.findMany({
        where: { userId },
        select: { kind: true, value: true, currency: true },
      }),
      prisma.userStatisticMetric.findMany({
        where: { userId },
        orderBy: { kind: "asc" },
      }),
      prisma.userStatisticCurrency.findMany({
        where: { userId },
        orderBy: { currency: "asc" },
      }),
      prisma.userStatisticMoney.findMany({
        where: { userId },
        orderBy: [{ kind: "asc" }, { currency: "asc" }],
      }),
    ])

    const expectedMetrics = new Map<string, { factCount: bigint; maxValue: number }>()
    const expectedCurrencies = new Map<string, bigint>()
    const expectedMoney = new Map<string, bigint>()
    for (const fact of facts) {
      const metric = expectedMetrics.get(fact.kind)
      expectedMetrics.set(fact.kind, {
        factCount: (metric?.factCount ?? ZERO) + ONE,
        maxValue: Math.max(metric?.maxValue ?? 0, fact.value),
      })
      if (fact.kind === "CURRENCY" && fact.currency) {
        expectedCurrencies.set(fact.currency, (expectedCurrencies.get(fact.currency) ?? ZERO) + ONE)
      }
      if ((fact.kind === "MONEY_SPENT" || fact.kind === "MONEY_RETURNED") && fact.currency) {
        const key = `${fact.kind}:${fact.currency}`
        expectedMoney.set(key, (expectedMoney.get(key) ?? ZERO) + BigInt(fact.value))
      }
    }

    expect(metrics.map(({ kind, factCount, maxValue }) => ({ kind, factCount, maxValue }))).toEqual(
      [...expectedMetrics.entries()].sort(([left], [right]) => left.localeCompare(right))
        .map(([kind, metric]) => ({ kind, ...metric }))
    )
    expect(currencies.map(({ currency, factCount }) => ({ currency, factCount }))).toEqual(
      [...expectedCurrencies.entries()].sort(([left], [right]) => left.localeCompare(right))
        .map(([currency, factCount]) => ({ currency, factCount }))
    )
    expect(money.map(({ kind, currency, totalValue }) => ({ kind, currency, totalValue }))).toEqual(
      [...expectedMoney.entries()].sort(([left], [right]) => left.localeCompare(right))
        .map(([key, totalValue]) => {
          const separator = key.indexOf(":")
          return {
            kind: key.slice(0, separator),
            currency: key.slice(separator + 1),
            totalValue,
          }
        })
    )
  }
}

describeDatabase("transactional database projections", () => {
  afterAll(async () => {
    await prisma.group.deleteMany({
      where: { createdBy: { email: { startsWith: testPrefix } } },
    })
    await prisma.user.deleteMany({ where: { email: { startsWith: testPrefix } } })
    await prisma.$disconnect()
  })

  it("keeps balance and statistic projections equal to source rows through mutations", async () => {
    const [admin, member, replacement] = await Promise.all([
      createUser("Projection admin"),
      createUser("Projection member"),
      createUser("Projection replacement"),
    ])
    const userIds = [admin.id, member.id, replacement.id]
    const group = await createGroup(admin.id, {
      name: "Projection lifecycle",
      type: "TRIP",
      currency: "RUB",
      memberIds: [member.id, replacement.id],
    })
    await expectBalanceProjectionMatchesSource(group.id)
    await expectStatisticProjectionsMatchSource(userIds)

    const expense = await createExpense(group.id, admin.id, {
      title: "Projected expense",
      amount: 30_000,
      currency: "RUB",
      date: operationDate,
      paidById: admin.id,
      splitType: "EXACT",
      splits: [
        { userId: admin.id, amount: 10_000 },
        { userId: member.id, amount: 20_000 },
      ],
    })
    await expectBalanceProjectionMatchesSource(group.id)
    await expectStatisticProjectionsMatchSource(userIds)

    await updateExpense(expense.id, admin.id, {
      title: "Corrected projected expense",
      amount: 24_000,
      currency: "RUB",
      date: operationDate,
      paidById: replacement.id,
      splitType: "EXACT",
      splits: [
        { userId: member.id, amount: 9_000 },
        { userId: replacement.id, amount: 15_000 },
      ],
    })
    await expectBalanceProjectionMatchesSource(group.id)
    await expectStatisticProjectionsMatchSource(userIds)

    await createSettlement(member.id, {
      groupId: group.id,
      toUserId: replacement.id,
      amount: 4_000,
      currency: "RUB",
      date: operationDate,
    })
    await expectBalanceProjectionMatchesSource(group.id)
    await expectStatisticProjectionsMatchSource(userIds)

    await resetSettlements(group.id, admin.id)
    await expectBalanceProjectionMatchesSource(group.id)
    await expectStatisticProjectionsMatchSource(userIds)

    await deleteExpense(expense.id, admin.id)
    await expectBalanceProjectionMatchesSource(group.id)
    await expectStatisticProjectionsMatchSource(userIds)

    await prisma.group.delete({ where: { id: group.id } })
    expect(await prisma.groupMemberPosition.count({ where: { groupId: group.id } })).toBe(0)
    await expectStatisticProjectionsMatchSource(userIds)
  })

  it("rebuilds both projections atomically from their source tables", async () => {
    const [admin, member] = await Promise.all([
      createUser("Projection rebuild admin"),
      createUser("Projection rebuild member"),
    ])
    const group = await createGroup(admin.id, {
      name: "Projection rebuild",
      type: "OTHER",
      currency: "RUB",
      memberIds: [member.id],
    })
    await createExpense(group.id, admin.id, {
      title: "Projection rebuild expense",
      amount: 1_000,
      currency: "RUB",
      date: operationDate,
      paidById: admin.id,
      splitType: "EXACT",
      splits: [{ userId: member.id, amount: 1_000 }],
    })

    await prisma.groupMemberPosition.update({
      where: { groupId_userId: { groupId: group.id, userId: admin.id } },
      data: { balance: { increment: BigInt(123) } },
    })
    await prisma.userStatisticMetric.updateMany({
      where: { userId: admin.id },
      data: { maxValue: 999_999 },
    })

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT rebuild_group_member_positions()`
      await tx.$executeRaw`SELECT rebuild_user_statistic_projections()`
    })

    await expectBalanceProjectionMatchesSource(group.id)
    await expectStatisticProjectionsMatchSource([admin.id, member.id])
  })
})
