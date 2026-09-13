import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import { computeGroupDebts, getOutstandingDebt } from "@/services/balances.service"
import { createExpense } from "@/services/expenses.service"
import { createGroup } from "@/services/groups.service"
import { createSettlement } from "@/services/settlements.service"

const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === "true"
const describeDatabase = runDatabaseTests ? describe : describe.skip
const testPrefix = `persistence-money-${Date.now()}`
const operationDate = "2028-04-05"
const publicMaximumAmount = 2_000_000_000

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

describeDatabase("money persistence boundaries", () => {
  afterAll(async () => {
    await prisma.group.deleteMany({
      where: { createdBy: { email: { startsWith: testPrefix } } },
    })
    await prisma.user.deleteMany({
      where: { email: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
  })

  it("persists the public maximum amount without integer overflow or loss", async () => {
    const admin = await createUser("Maximum amount admin")
    const group = await createGroup(admin.id, {
      name: "Maximum amount",
      type: "OTHER",
      currency: "RUB",
      memberIds: [],
    })

    const expense = await createExpense(group.id, admin.id, {
      title: "Maximum supported expense",
      amount: publicMaximumAmount,
      currency: "RUB",
      date: operationDate,
      paidById: admin.id,
      splitType: "EXACT",
      splits: [{ userId: admin.id, amount: publicMaximumAmount }],
    })

    expect(expense).toMatchObject({
      amount: publicMaximumAmount,
      amountBase: publicMaximumAmount,
    })
    expect(expense.splits).toHaveLength(1)
    expect(expense.splits[0]).toMatchObject({
      amount: publicMaximumAmount,
      amountBase: publicMaximumAmount,
    })
    expect(
      await prisma.userStatisticFact.findUnique({
        where: {
          userId_kind_reference: {
            userId: admin.id,
            kind: "MONEY_SPENT",
            reference: expense.id,
          },
        },
        select: { value: true, currency: true },
      })
    ).toEqual({ value: publicMaximumAmount, currency: "RUB" })
  })

  it("rejects converted integer overflow before persisting any aggregate row", async () => {
    const admin = await createUser("Converted overflow admin")
    const group = await createGroup(admin.id, {
      name: "Converted overflow",
      type: "TRIP",
      currency: "RUB",
      memberIds: [],
    })
    const countBefore = await prisma.expense.count({ where: { groupId: group.id } })

    await expect(
      createExpense(group.id, admin.id, {
        title: "Converted overflow expense",
        amount: publicMaximumAmount,
        currency: "USD",
        customRate: 1.1,
        date: operationDate,
        paidById: admin.id,
        splitType: "EXACT",
        splits: [{ userId: admin.id, amount: publicMaximumAmount }],
      })
    ).rejects.toThrow("CONVERTED_AMOUNT_TOO_LARGE")

    expect(await prisma.expense.count({ where: { groupId: group.id } })).toBe(countBefore)
    expect(
      await prisma.activityLog.count({
        where: { groupId: group.id, type: "EXPENSE_CREATED" },
      })
    ).toBe(0)
  })

  it("persists the exact equal-split minor-unit allocation when amount is smaller than participant count", async () => {
    const [admin, firstMember, secondMember] = await Promise.all([
      createUser("Minor unit admin"),
      createUser("Minor unit first"),
      createUser("Minor unit second"),
    ])
    const group = await createGroup(admin.id, {
      name: "Minor unit allocation",
      type: "OTHER",
      currency: "RUB",
      memberIds: [firstMember.id, secondMember.id],
    })

    const expense = await createExpense(group.id, admin.id, {
      title: "One minor unit",
      amount: 1,
      currency: "RUB",
      date: operationDate,
      paidById: admin.id,
      splitType: "EQUAL",
      splits: [
        { userId: admin.id },
        { userId: firstMember.id },
        { userId: secondMember.id },
      ],
    })

    const splits = await prisma.expenseSplit.findMany({
      where: { expenseId: expense.id },
      select: { userId: true, amount: true, amountBase: true },
    })
    expect(splits.find((split) => split.userId === admin.id)).toMatchObject({ amount: 1, amountBase: 1 })
    expect(splits.find((split) => split.userId === firstMember.id)).toMatchObject({
      amount: 0,
      amountBase: 0,
    })
    expect(splits.find((split) => split.userId === secondMember.id)).toMatchObject({
      amount: 0,
      amountBase: 0,
    })
    expect(splits.reduce((sum, split) => sum + (split.amountBase ?? 0), 0)).toBe(1)
  })

  it("allocates equal FX fractions deterministically by request order and preserves the converted total", async () => {
    const [admin, firstMember, secondMember] = await Promise.all([
      createUser("FX tie admin"),
      createUser("FX tie first"),
      createUser("FX tie second"),
    ])
    const group = await createGroup(admin.id, {
      name: "FX tie allocation",
      type: "TRIP",
      currency: "RUB",
      memberIds: [firstMember.id, secondMember.id],
    })

    const expense = await createExpense(group.id, admin.id, {
      title: "Equal FX fractions",
      amount: 6,
      currency: "USD",
      customRate: 0.75,
      date: operationDate,
      paidById: admin.id,
      splitType: "EQUAL",
      splits: [
        { userId: admin.id },
        { userId: firstMember.id },
        { userId: secondMember.id },
      ],
    })

    const splits = await prisma.expenseSplit.findMany({ where: { expenseId: expense.id } })
    expect(expense.amountBase).toBe(5)
    expect(splits.find((split) => split.userId === admin.id)?.amountBase).toBe(2)
    expect(splits.find((split) => split.userId === firstMember.id)?.amountBase).toBe(2)
    expect(splits.find((split) => split.userId === secondMember.id)?.amountBase).toBe(1)
    expect(splits.reduce((sum, split) => sum + (split.amountBase ?? 0), 0)).toBe(expense.amountBase)
  })

  it("reuses reconciled FX split amounts for full cash and rounds partial cash independently", async () => {
    const [admin, fullCashMember, partialCashMember] = await Promise.all([
      createUser("Cash FX admin"),
      createUser("Full cash member"),
      createUser("Partial cash member"),
    ])
    const group = await createGroup(admin.id, {
      name: "Cash FX boundaries",
      type: "TRIP",
      currency: "RUB",
      memberIds: [fullCashMember.id, partialCashMember.id],
    })

    const expense = await createExpense(group.id, admin.id, {
      title: "Cash FX expense",
      amount: 6,
      currency: "USD",
      customRate: 0.75,
      date: operationDate,
      paidById: admin.id,
      splitType: "EQUAL",
      splits: [
        { userId: admin.id },
        { userId: fullCashMember.id },
        { userId: partialCashMember.id },
      ],
      cashPayments: [
        { userId: fullCashMember.id, amount: 2 },
        { userId: partialCashMember.id, amount: 1 },
      ],
    })

    const settlements = await prisma.settlement.findMany({
      where: { expenseId: expense.id },
      select: { fromUserId: true, amount: true, amountBase: true, currency: true },
      orderBy: { fromUserId: "asc" },
    })
    expect(settlements).toHaveLength(2)
    expect(settlements.find((item) => item.fromUserId === fullCashMember.id)).toMatchObject({
      amount: 2,
      amountBase: 2,
      currency: "USD",
    })
    expect(settlements.find((item) => item.fromUserId === partialCashMember.id)).toMatchObject({
      amount: 1,
      amountBase: 1,
      currency: "USD",
    })
    expect(await getOutstandingDebt(group.id, fullCashMember.id, admin.id)).toBe(0)
    expect(await getOutstandingDebt(group.id, partialCashMember.id, admin.id)).toBe(0)
    expect((await computeGroupDebts(group.id)).raw.reduce((sum, row) => sum + row.balance, 0)).toBe(0)
  })

  it("ignores transport currency for a manual settlement and persists the group settlement currency", async () => {
    const [debtor, creditor] = await Promise.all([
      createUser("Settlement currency debtor"),
      createUser("Settlement currency creditor"),
    ])
    const group = await createGroup(debtor.id, {
      name: "Settlement currency",
      type: "TRIP",
      currency: "EUR",
      memberIds: [creditor.id],
    })
    await createExpense(group.id, debtor.id, {
      title: "EUR debt",
      amount: 42_000,
      currency: "EUR",
      date: operationDate,
      paidById: creditor.id,
      splitType: "EXACT",
      splits: [{ userId: debtor.id, amount: 42_000 }],
    })

    const settlement = await createSettlement(debtor.id, {
      groupId: group.id,
      toUserId: creditor.id,
      amount: 42_000,
      currency: "USD",
      date: operationDate,
    })

    expect(settlement).toMatchObject({
      amount: 42_000,
      amountBase: 42_000,
      currency: "EUR",
    })
    expect(await getOutstandingDebt(group.id, debtor.id, creditor.id)).toBe(0)
  })
})
