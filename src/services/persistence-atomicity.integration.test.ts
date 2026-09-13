import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import { createExpense, deleteExpense, updateExpense } from "@/services/expenses.service"
import { createGroup, removeMember } from "@/services/groups.service"
import { createSettlement, resetSettlements } from "@/services/settlements.service"

const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === "true"
const describeDatabase = runDatabaseTests ? describe : describe.skip
const testPrefix = `persistence-atomicity-${Date.now()}`
const operationDate = "2028-02-20"

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

async function createGroupWithResolvedFormerPayer(name: string) {
  const [admin, formerPayer] = await Promise.all([
    createUser(`${name} admin`),
    createUser(`${name} former payer`),
  ])
  const group = await createGroup(admin.id, {
    name,
    type: "OTHER",
    currency: "RUB",
    memberIds: [formerPayer.id],
  })
  const expense = await createExpense(group.id, admin.id, {
    title: "Expense paid by future inactive member",
    amount: 30_000,
    currency: "RUB",
    date: operationDate,
    paidById: formerPayer.id,
    splitType: "EXACT",
    splits: [{ userId: admin.id, amount: 30_000 }],
  })
  const settlement = await createSettlement(admin.id, {
    groupId: group.id,
    toUserId: formerPayer.id,
    amount: 30_000,
    currency: "RUB",
    date: operationDate,
    notes: "Resolved before leaving",
  })
  await removeMember(group.id, formerPayer.id, formerPayer.id)
  return { admin, formerPayer, group, expense, settlement }
}

describeDatabase("persistence transaction atomicity", () => {
  afterAll(async () => {
    await prisma.group.deleteMany({
      where: { createdBy: { email: { startsWith: testPrefix } } },
    })
    await prisma.user.deleteMany({
      where: { email: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
  })

  it("rolls back every expense row and side effect when an edit would orphan an inactive balance", async () => {
    const { admin, formerPayer, group, expense, settlement } =
      await createGroupWithResolvedFormerPayer("Atomic update")
    const [expenseBefore, splitsBefore, settlementBefore, factsBefore, groupBefore] = await Promise.all([
      prisma.expense.findUniqueOrThrow({ where: { id: expense.id } }),
      prisma.expenseSplit.findMany({ where: { expenseId: expense.id }, orderBy: { id: "asc" } }),
      prisma.settlement.findUniqueOrThrow({ where: { id: settlement.id } }),
      prisma.userStatisticFact.findMany({
        where: { reference: { in: [expense.id, settlement.id] } },
        orderBy: [{ kind: "asc" }, { userId: "asc" }],
      }),
      prisma.group.findUniqueOrThrow({ where: { id: group.id }, select: { updatedAt: true } }),
    ])

    await expect(
      updateExpense(expense.id, admin.id, {
        title: "Forbidden corrected expense",
        amount: 45_000,
        currency: "RUB",
        date: "2028-02-21",
        paidById: admin.id,
        splitType: "EXACT",
        splits: [{ userId: admin.id, amount: 45_000 }],
      })
    ).rejects.toThrow("INACTIVE_MEMBER_HAS_BALANCE")

    const [expenseAfter, splitsAfter, settlementAfter, factsAfter, groupAfter, updateLogs] =
      await Promise.all([
        prisma.expense.findUniqueOrThrow({ where: { id: expense.id } }),
        prisma.expenseSplit.findMany({ where: { expenseId: expense.id }, orderBy: { id: "asc" } }),
        prisma.settlement.findUniqueOrThrow({ where: { id: settlement.id } }),
        prisma.userStatisticFact.findMany({
          where: { reference: { in: [expense.id, settlement.id] } },
          orderBy: [{ kind: "asc" }, { userId: "asc" }],
        }),
        prisma.group.findUniqueOrThrow({ where: { id: group.id }, select: { updatedAt: true } }),
        prisma.activityLog.count({
          where: { groupId: group.id, type: "EXPENSE_UPDATED", entityId: expense.id },
        }),
      ])

    expect(expenseAfter).toEqual(expenseBefore)
    expect(splitsAfter).toEqual(splitsBefore)
    expect(settlementAfter).toEqual(settlementBefore)
    expect(factsAfter).toEqual(factsBefore)
    expect(groupAfter.updatedAt).toEqual(groupBefore.updatedAt)
    expect(updateLogs).toBe(0)
    expect(expenseAfter.paidById).toBe(formerPayer.id)
  })

  it("rolls back deletion, cascade cleanup, activity, and timestamp when deletion would orphan an inactive balance", async () => {
    const { admin, group, expense, settlement } =
      await createGroupWithResolvedFormerPayer("Atomic delete")
    const groupBefore = await prisma.group.findUniqueOrThrow({
      where: { id: group.id },
      select: { updatedAt: true },
    })

    await expect(deleteExpense(expense.id, admin.id)).rejects.toThrow(
      "INACTIVE_MEMBER_HAS_BALANCE"
    )

    const [expenseRows, splitRows, settlementRows, deleteLogs, groupAfter] = await Promise.all([
      prisma.expense.count({ where: { id: expense.id } }),
      prisma.expenseSplit.count({ where: { expenseId: expense.id } }),
      prisma.settlement.count({ where: { id: settlement.id } }),
      prisma.activityLog.count({
        where: { groupId: group.id, type: "EXPENSE_DELETED", entityId: expense.id },
      }),
      prisma.group.findUniqueOrThrow({ where: { id: group.id }, select: { updatedAt: true } }),
    ])
    expect({ expenseRows, splitRows, settlementRows, deleteLogs }).toEqual({
      expenseRows: 1,
      splitRows: 1,
      settlementRows: 1,
      deleteLogs: 0,
    })
    expect(groupAfter.updatedAt).toEqual(groupBefore.updatedAt)
  })

  it("rolls back settlement reset when it would restore debt for an inactive member", async () => {
    const { admin, group, settlement } =
      await createGroupWithResolvedFormerPayer("Atomic settlement reset")
    const factsBefore = await prisma.userStatisticFact.findMany({
      where: { reference: settlement.id },
      orderBy: [{ kind: "asc" }, { userId: "asc" }],
    })

    await expect(resetSettlements(group.id, admin.id)).rejects.toThrow(
      "INACTIVE_MEMBER_HAS_BALANCE"
    )

    expect(await prisma.settlement.count({ where: { id: settlement.id } })).toBe(1)
    expect(
      await prisma.activityLog.count({
        where: { groupId: group.id, type: "SETTLEMENTS_RESET" },
      })
    ).toBe(0)
    expect(
      await prisma.userStatisticFact.findMany({
        where: { reference: settlement.id },
        orderBy: [{ kind: "asc" }, { userId: "asc" }],
      })
    ).toEqual(factsBefore)
  })

  it("persists no expense aggregate when duplicate split rows fail the database constraint", async () => {
    const [admin, member] = await Promise.all([
      createUser("Duplicate split admin"),
      createUser("Duplicate split member"),
    ])
    const group = await createGroup(admin.id, {
      name: "Duplicate split atomicity",
      type: "OTHER",
      currency: "RUB",
      memberIds: [member.id],
    })
    const activityCountBefore = await prisma.activityLog.count({ where: { groupId: group.id } })

    await expect(
      createExpense(group.id, admin.id, {
        title: "Duplicate split must roll back",
        amount: 20_000,
        currency: "RUB",
        date: operationDate,
        paidById: admin.id,
        splitType: "EXACT",
        splits: [
          { userId: member.id, amount: 10_000 },
          { userId: member.id, amount: 10_000 },
        ],
      })
    ).rejects.toThrow()

    expect(
      await prisma.expense.count({
        where: { groupId: group.id, title: "Duplicate split must roll back" },
      })
    ).toBe(0)
    expect(await prisma.activityLog.count({ where: { groupId: group.id } })).toBe(
      activityCountBefore
    )
    expect(
      await prisma.userStatisticFact.count({
        where: { kind: "EXPENSE_CREATED", userId: admin.id },
      })
    ).toBe(0)
  })

  it("persists no settlement, activity, or history facts after an overpayment rejection", async () => {
    const [debtor, creditor] = await Promise.all([
      createUser("Rejected settlement debtor"),
      createUser("Rejected settlement creditor"),
    ])
    const group = await createGroup(debtor.id, {
      name: "Rejected settlement group",
      type: "OTHER",
      currency: "RUB",
      memberIds: [creditor.id],
    })
    await createExpense(group.id, debtor.id, {
      title: "Small debt",
      amount: 1_000,
      currency: "RUB",
      date: operationDate,
      paidById: creditor.id,
      splitType: "EXACT",
      splits: [{ userId: debtor.id, amount: 1_000 }],
    })
    const before = {
      settlements: await prisma.settlement.count({ where: { groupId: group.id } }),
      activities: await prisma.activityLog.count({
        where: { groupId: group.id, type: "SETTLEMENT_CREATED" },
      }),
      sentFacts: await prisma.userStatisticFact.count({
        where: { userId: debtor.id, kind: "SETTLEMENT_SENT" },
      }),
      receivedFacts: await prisma.userStatisticFact.count({
        where: { userId: creditor.id, kind: "SETTLEMENT_RECEIVED" },
      }),
    }

    await expect(
      createSettlement(debtor.id, {
        groupId: group.id,
        toUserId: creditor.id,
        amount: 1_001,
        currency: "RUB",
        date: operationDate,
      })
    ).rejects.toThrow("AMOUNT_EXCEEDS_DEBT")

    expect({
      settlements: await prisma.settlement.count({ where: { groupId: group.id } }),
      activities: await prisma.activityLog.count({
        where: { groupId: group.id, type: "SETTLEMENT_CREATED" },
      }),
      sentFacts: await prisma.userStatisticFact.count({
        where: { userId: debtor.id, kind: "SETTLEMENT_SENT" },
      }),
      receivedFacts: await prisma.userStatisticFact.count({
        where: { userId: creditor.id, kind: "SETTLEMENT_RECEIVED" },
      }),
    }).toEqual(before)
  })
})
