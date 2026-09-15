import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import { createExpense, deleteExpense, updateExpense } from "@/services/expenses.service"
import { addMember, createGroup, removeMember } from "@/services/groups.service"
import { getOrCreateInvite, revokeInvite } from "@/services/invites.service"
import { createSettlement, resetSettlements } from "@/services/settlements.service"
import {
  getHistoricalUserMoneyStatistics,
  getHistoricalUserStatistics,
  getHistoricalUserStatisticsSnapshot,
} from "@/services/statistics.service"

const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === "true"
const describeDatabase = runDatabaseTests ? describe : describe.skip
const testPrefix = `statistics-history-integration-${Date.now()}`
const operationDate = "2028-03-10"

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

describeDatabase("statistics history persistence invariants", () => {
  afterAll(async () => {
    await prisma.group.deleteMany({
      where: { createdBy: { email: { startsWith: testPrefix } } },
    })
    await prisma.user.deleteMany({
      where: { email: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
  })

  it("reconciles removed and added expense participants while retaining the lifetime participant maximum", async () => {
    const [admin, removedParticipant, addedParticipant] = await Promise.all([
      createUser("Participant history admin"),
      createUser("Removed participant"),
      createUser("Added participant"),
    ])
    const group = await createGroup(admin.id, {
      name: "Participant reconciliation",
      type: "TRIP",
      currency: "RUB",
      memberIds: [removedParticipant.id, addedParticipant.id],
    })
    const expense = await createExpense(group.id, admin.id, {
      title: "Original participant set",
      amount: 30_000,
      currency: "RUB",
      date: operationDate,
      paidById: admin.id,
      splitType: "EQUAL",
      splits: [
        { userId: admin.id },
        { userId: removedParticipant.id },
        { userId: addedParticipant.id },
      ],
    })

    await updateExpense(expense.id, admin.id, {
      title: "Reduced participant set",
      amount: 20_000,
      currency: "RUB",
      date: operationDate,
      paidById: admin.id,
      splitType: "EQUAL",
      splits: [{ userId: admin.id }, { userId: addedParticipant.id }],
    })

    const participantFacts = await prisma.userStatisticFact.findMany({
      where: { kind: "EXPENSE_PARTICIPATED", reference: expense.id },
      select: { userId: true },
      orderBy: { userId: "asc" },
    })
    expect(participantFacts.map((fact) => fact.userId).sort()).toEqual(
      [admin.id, addedParticipant.id].sort()
    )
    expect(participantFacts.some((fact) => fact.userId === removedParticipant.id)).toBe(false)
    const currencyFacts = await prisma.userStatisticFact.findMany({
      where: { kind: "CURRENCY", reference: expense.id },
      select: { userId: true, currency: true },
      orderBy: { userId: "asc" },
    })
    expect(currencyFacts).toEqual(
      [admin.id, addedParticipant.id]
        .sort()
        .map((userId) => ({ userId, currency: "RUB" }))
    )
    expect((await getHistoricalUserStatistics(admin.id)).maxExpenseParticipants).toBe(3)
  })

  it("retains a currency fact while another live expense still uses that currency", async () => {
    const [admin, member] = await Promise.all([
      createUser("Shared currency admin"),
      createUser("Shared currency member"),
    ])
    const group = await createGroup(admin.id, {
      name: "Shared currency facts",
      type: "OTHER",
      currency: "RUB",
      memberIds: [member.id],
    })
    const input = {
      amount: 10_000,
      currency: "RUB" as const,
      date: operationDate,
      paidById: admin.id,
      splitType: "EQUAL" as const,
      splits: [{ userId: admin.id }, { userId: member.id }],
    }
    const first = await createExpense(group.id, admin.id, { title: "First RUB", ...input })
    const second = await createExpense(group.id, admin.id, { title: "Second RUB", ...input })

    await updateExpense(first.id, admin.id, {
      title: "First changed to USD",
      ...input,
      amount: 100,
      currency: "USD",
      customRate: 100,
    })

    const facts = await prisma.userStatisticFact.findMany({
      where: { userId: admin.id, kind: "CURRENCY" },
      select: { reference: true, currency: true },
      orderBy: { currency: "asc" },
    })
    expect(facts).toHaveLength(2)
    expect(facts).toEqual(expect.arrayContaining([
      { reference: first.id, currency: "USD" },
      { reference: second.id, currency: "RUB" },
    ]))
    expect((await getHistoricalUserStatistics(admin.id)).currenciesUsed).toBe(2)
  })

  it("does not erase a deleted expense currency when an unrelated live expense is edited", async () => {
    const admin = await createUser("Deleted currency history admin")
    const group = await createGroup(admin.id, {
      name: "Deleted currency history",
      type: "OTHER",
      currency: "RUB",
      memberIds: [],
    })
    const deletedExpense = await createExpense(group.id, admin.id, {
      title: "Historical USD",
      amount: 100,
      currency: "USD",
      customRate: 100,
      date: operationDate,
      paidById: admin.id,
      splitType: "EQUAL",
      splits: [{ userId: admin.id }],
    })
    const liveExpense = await createExpense(group.id, admin.id, {
      title: "Live RUB",
      amount: 10_000,
      currency: "RUB",
      date: operationDate,
      paidById: admin.id,
      splitType: "EQUAL",
      splits: [{ userId: admin.id }],
    })

    await deleteExpense(deletedExpense.id, admin.id)
    await updateExpense(liveExpense.id, admin.id, {
      title: "Live EUR",
      amount: 100,
      currency: "EUR",
      customRate: 100,
      date: operationDate,
      paidById: admin.id,
      splitType: "EQUAL",
      splits: [{ userId: admin.id }],
    })

    const facts = await prisma.userStatisticFact.findMany({
      where: { userId: admin.id, kind: "CURRENCY" },
      select: { reference: true, currency: true },
      orderBy: { currency: "asc" },
    })
    expect(facts).toHaveLength(2)
    expect(facts).toEqual(expect.arrayContaining([
      { reference: liveExpense.id, currency: "EUR" },
      { reference: deletedExpense.id, currency: "USD" },
    ]))
    expect((await getHistoricalUserStatistics(admin.id)).currenciesUsed).toBe(2)
  })

  it("moves corrected lifetime money to the current payer, amount, and currency without double counting edits", async () => {
    const [admin, correctedPayer] = await Promise.all([
      createUser("Corrected money admin"),
      createUser("Corrected money payer"),
    ])
    const group = await createGroup(admin.id, {
      name: "Corrected lifetime money",
      type: "OTHER",
      currency: "RUB",
      memberIds: [correctedPayer.id],
    })
    const expense = await createExpense(group.id, admin.id, {
      title: "Original money",
      amount: 50_000,
      currency: "RUB",
      date: operationDate,
      paidById: admin.id,
      splitType: "EQUAL",
      splits: [{ userId: admin.id }, { userId: correctedPayer.id }],
    })

    await updateExpense(expense.id, admin.id, {
      title: "Corrected money",
      amount: 700,
      currency: "USD",
      customRate: 100,
      date: operationDate,
      paidById: correctedPayer.id,
      splitType: "EQUAL",
      splits: [{ userId: admin.id }, { userId: correctedPayer.id }],
    })
    await updateExpense(expense.id, admin.id, {
      title: "Corrected money again",
      amount: 650,
      currency: "USD",
      customRate: 100,
      date: operationDate,
      paidById: correctedPayer.id,
      splitType: "EQUAL",
      splits: [{ userId: admin.id }, { userId: correctedPayer.id }],
    })

    expect(await getHistoricalUserMoneyStatistics(admin.id)).toEqual({ spent: [], returned: [] })
    expect(await getHistoricalUserMoneyStatistics(correctedPayer.id)).toEqual({
      spent: [{ currency: "USD", amount: 650 }],
      returned: [],
    })
    expect(
      await prisma.userStatisticFact.findMany({
        where: { kind: "MONEY_SPENT", reference: expense.id },
        select: { userId: true, value: true, currency: true },
      })
    ).toEqual([{ userId: correctedPayer.id, value: 650, currency: "USD" }])
  })

  it("reconciles the coffee fact after title and payer corrections", async () => {
    const [admin, correctedPayer] = await Promise.all([
      createUser("Coffee history admin"),
      createUser("Coffee corrected payer"),
    ])
    const group = await createGroup(admin.id, {
      name: "Coffee correction",
      type: "OTHER",
      currency: "RUB",
      memberIds: [correctedPayer.id],
    })
    const expense = await createExpense(group.id, admin.id, {
      title: "Капучино",
      amount: 40_000,
      currency: "RUB",
      date: operationDate,
      paidById: admin.id,
      splitType: "EQUAL",
      splits: [{ userId: admin.id }, { userId: correctedPayer.id }],
    })

    await updateExpense(expense.id, admin.id, {
      title: "Обычный ужин",
      amount: 40_000,
      currency: "RUB",
      date: operationDate,
      paidById: correctedPayer.id,
      splitType: "EQUAL",
      splits: [{ userId: admin.id }, { userId: correctedPayer.id }],
    })
    expect(
      await prisma.userStatisticFact.count({
        where: { kind: "COFFEE_PAID", reference: expense.id },
      })
    ).toBe(0)

    await updateExpense(expense.id, admin.id, {
      title: "Латте",
      amount: 40_000,
      currency: "RUB",
      date: operationDate,
      paidById: correctedPayer.id,
      splitType: "EQUAL",
      splits: [{ userId: admin.id }, { userId: correctedPayer.id }],
    })
    expect(
      await prisma.userStatisticFact.findMany({
        where: { kind: "COFFEE_PAID", reference: expense.id },
        select: { userId: true },
      })
    ).toEqual([{ userId: correctedPayer.id }])
  })

  it("keeps settlement lifetime history after reset while current statistics follow live rows", async () => {
    const [debtor, creditor] = await Promise.all([
      createUser("Reset history debtor"),
      createUser("Reset history creditor"),
    ])
    const group = await createGroup(debtor.id, {
      name: "Settlement reset history",
      type: "OTHER",
      currency: "RUB",
      memberIds: [creditor.id],
    })
    await createExpense(group.id, debtor.id, {
      title: "Debt for history",
      amount: 12_345,
      currency: "RUB",
      date: operationDate,
      paidById: creditor.id,
      splitType: "EXACT",
      splits: [{ userId: debtor.id, amount: 12_345 }],
    })
    const settlement = await createSettlement(debtor.id, {
      groupId: group.id,
      toUserId: creditor.id,
      amount: 12_345,
      currency: "RUB",
      date: operationDate,
    })

    await resetSettlements(group.id, debtor.id)

    expect(await prisma.settlement.count({ where: { id: settlement.id } })).toBe(0)
    const snapshot = await getHistoricalUserStatisticsSnapshot(creditor.id)
    expect(snapshot.metrics.settlementsReceived).toBe(1)
    expect(snapshot.money).toEqual({
      spent: [{ currency: "RUB", amount: 12_345 }],
      returned: [{ currency: "RUB", amount: 12_345 }],
    })
  })

  it("records each genuinely new invite but does not duplicate an active invite fact", async () => {
    const admin = await createUser("Invite history admin")
    const group = await createGroup(admin.id, {
      name: "Invite history",
      type: "HOME",
      currency: "RUB",
      memberIds: [],
    })

    const first = await getOrCreateInvite(group.id, admin.id)
    expect((await getOrCreateInvite(group.id, admin.id)).id).toBe(first.id)
    await revokeInvite(group.id, admin.id)
    const second = await getOrCreateInvite(group.id, admin.id)

    expect(second.id).not.toBe(first.id)
    expect(
      await prisma.userStatisticFact.findMany({
        where: { userId: admin.id, kind: "INVITE_CREATED" },
        select: { reference: true },
        orderBy: { reference: "asc" },
      })
    ).toEqual(
      [{ reference: first.id }, { reference: second.id }].sort((left, right) =>
        left.reference.localeCompare(right.reference)
      )
    )
  })

  it("preserves membership records and historical maxima after members leave", async () => {
    const [admin, firstMember, secondMember] = await Promise.all([
      createUser("Membership history admin"),
      createUser("Membership history first"),
      createUser("Membership history second"),
    ])
    const group = await createGroup(admin.id, {
      name: "Membership history",
      type: "COUPLE",
      currency: "RUB",
      memberIds: [],
    })
    await addMember(group.id, admin.id, firstMember.id)
    await addMember(group.id, admin.id, secondMember.id)
    await removeMember(group.id, firstMember.id, firstMember.id)
    await removeMember(group.id, secondMember.id, secondMember.id)

    const memberships = await prisma.groupMember.findMany({
      where: { groupId: group.id },
      select: { userId: true, isActive: true },
      orderBy: { userId: "asc" },
    })
    expect(memberships).toHaveLength(3)
    expect(memberships.filter((membership) => membership.isActive)).toEqual([
      { userId: admin.id, isActive: true },
    ])
    expect((await getHistoricalUserStatistics(firstMember.id)).activeGroups).toBe(1)
    expect((await getHistoricalUserStatistics(firstMember.id)).maxGroupMembers).toBe(3)
    expect((await getHistoricalUserStatistics(firstMember.id)).coupleGroups).toBe(1)
  })

  it("counts lifetime OTHER groups independently from the maximum active-group count", async () => {
    const [trackedMember, homeAdmin, otherAdmin] = await Promise.all([
      createUser("Sequential group member"),
      createUser("Sequential home admin"),
      createUser("Sequential other admin"),
    ])
    const homeGroup = await createGroup(homeAdmin.id, {
      name: "Sequential home group",
      type: "HOME",
      currency: "RUB",
      memberIds: [trackedMember.id],
    })
    await removeMember(homeGroup.id, trackedMember.id, trackedMember.id)
    const otherGroup = await createGroup(otherAdmin.id, {
      name: "Sequential other group",
      type: "OTHER",
      currency: "RUB",
      memberIds: [trackedMember.id],
    })
    await removeMember(otherGroup.id, trackedMember.id, trackedMember.id)

    expect(await getHistoricalUserStatistics(trackedMember.id)).toMatchObject({
      activeGroups: 1,
      homeGroups: 1,
      otherGroups: 1,
      groupTypesUsed: 2,
    })
  })
})
