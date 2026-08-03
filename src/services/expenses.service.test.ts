import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import { getOutstandingDebt } from "@/services/balances.service"
import {
  createExpense,
  deleteExpense,
  getExpense,
  getGroupExpenses,
  updateExpense,
} from "@/services/expenses.service"
import { createGroup } from "@/services/groups.service"
import type { CreateExpenseInput } from "@/lib/validations/expense"

const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === "true"
const describeDatabase = runDatabaseTests ? describe : describe.skip
const testPrefix = `codex-expenses-${Date.now()}`

// Fixed UTC-midnight day for every expense so getRateToRub reads the pre-seeded
// cache and never touches the CBR network. A future date guarantees no
// pre-existing production rows collide with our fixed factors.
const RATE_DATE_ISO = "2027-04-15T00:00:00.000Z"
const RATE_DATE = new Date(RATE_DATE_ISO)
const EXPENSE_DATE_ISO = RATE_DATE_ISO
const SEED_CURRENCIES = ["RUB", "USD", "EUR"]

let userSeq = 0
async function makeUser(name: string) {
  userSeq += 1
  return prisma.user.create({
    data: {
      email: `${testPrefix}-u${userSeq}@t.io`,
      name,
      passwordHash: "x",
    },
  })
}

// Idempotent: RUB=1, USD=90, EUR=100 at the fixed day. getRateToRub returns 1 for
// RUB without a cache lookup; USD/EUR resolve from these rows (rubles per unit).
async function seedRates() {
  await prisma.exchangeRate.createMany({
    data: [
      { date: RATE_DATE, currency: "RUB", rate: 1 },
      { date: RATE_DATE, currency: "USD", rate: 90 },
      { date: RATE_DATE, currency: "EUR", rate: 100 },
    ],
    skipDuplicates: true,
  })
}

function expenseInput(overrides: Partial<CreateExpenseInput>): CreateExpenseInput {
  return {
    title: "Test expense",
    amount: 10_000,
    currency: "RUB",
    date: EXPENSE_DATE_ISO,
    splitType: "EQUAL",
    paidById: "",
    splits: [],
    ...overrides,
  } as CreateExpenseInput
}

describeDatabase("expenses.service (DB-backed behavioral spec)", () => {
  afterAll(async () => {
    await prisma.group.deleteMany({
      where: { createdBy: { email: { startsWith: testPrefix } } },
    })
    await prisma.user.deleteMany({
      where: { email: { startsWith: testPrefix } },
    })
    await prisma.exchangeRate.deleteMany({
      where: { date: RATE_DATE, currency: { in: SEED_CURRENCIES } },
    })
    await prisma.$disconnect()
  })

  describe("createExpense split persistence (group currency === expense currency)", () => {
    it("EQUAL: persists split rows, sum equals amount, remainder to first, amountBase mirrors amount", async () => {
      const [admin, member] = await Promise.all([makeUser("Eq Admin"), makeUser("Eq Member")])
      const group = await createGroup(admin.id, {
        name: "Equal group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })

      const expense = await createExpense(
        group.id,
        admin.id,
        expenseInput({
          amount: 10_001,
          paidById: admin.id,
          splitType: "EQUAL",
          splits: [{ userId: admin.id }, { userId: member.id }],
        })
      )

      const splits = await prisma.expenseSplit.findMany({ where: { expenseId: expense.id } })
      expect(splits).toHaveLength(2)
      const sum = splits.reduce((acc, s) => acc + s.amount, 0)
      expect(sum).toBe(10_001)

      const first = splits.find((s) => s.userId === admin.id)
      const second = splits.find((s) => s.userId === member.id)
      // 10001 / 2 = 5000 share, remainder 1 goes to the first participant (admin)
      expect(first?.amount).toBe(5_001)
      expect(second?.amount).toBe(5_000)

      // Group currency === expense currency → amountBase mirrors amount everywhere
      expect(expense.amountBase).toBe(10_001)
      expect(expense.customRate).toBeNull()
      expect(expense.currency).toBe("RUB")
      expect(first?.amountBase).toBe(5_001)
      expect(second?.amountBase).toBe(5_000)
    })

    it("EXACT: persists exact per-participant amounts summing to amount with mirrored amountBase", async () => {
      const [admin, member] = await Promise.all([makeUser("Ex Admin"), makeUser("Ex Member")])
      const group = await createGroup(admin.id, {
        name: "Exact group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })

      const expense = await createExpense(
        group.id,
        admin.id,
        expenseInput({
          amount: 10_001,
          paidById: admin.id,
          splitType: "EXACT",
          splits: [
            { userId: admin.id, amount: 5_001 },
            { userId: member.id, amount: 5_000 },
          ],
        })
      )

      const splits = await prisma.expenseSplit.findMany({ where: { expenseId: expense.id } })
      expect(splits.reduce((acc, s) => acc + s.amount, 0)).toBe(10_001)
      expect(splits.find((s) => s.userId === admin.id)?.amount).toBe(5_001)
      expect(splits.find((s) => s.userId === member.id)?.amount).toBe(5_000)
      expect(expense.amountBase).toBe(10_001)
      expect(splits.every((s) => s.amountBase === s.amount)).toBe(true)
    })

    it("PERCENTAGE: floors shares, gives remainder to first, persists percentage, mirrors amountBase", async () => {
      const [admin, member] = await Promise.all([makeUser("Pc Admin"), makeUser("Pc Member")])
      const group = await createGroup(admin.id, {
        name: "Percentage group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })

      const expense = await createExpense(
        group.id,
        admin.id,
        expenseInput({
          amount: 10_001,
          paidById: admin.id,
          splitType: "PERCENTAGE",
          splits: [
            { userId: admin.id, percentage: 5_000 },
            { userId: member.id, percentage: 5_000 },
          ],
        })
      )

      const splits = await prisma.expenseSplit.findMany({ where: { expenseId: expense.id } })
      expect(splits.reduce((acc, s) => acc + s.amount, 0)).toBe(10_001)
      // floor(10001*5000/10000)=5000 each; remainder 1 → first participant (admin)
      expect(splits.find((s) => s.userId === admin.id)?.amount).toBe(5_001)
      expect(splits.find((s) => s.userId === member.id)?.amount).toBe(5_000)
      // percentage (basis points) persisted for PERCENTAGE splits
      expect(splits.find((s) => s.userId === admin.id)?.percentage).toBe(5_000)
      expect(splits.find((s) => s.userId === member.id)?.percentage).toBe(5_000)
      expect(expense.amountBase).toBe(10_001)
      expect(splits.every((s) => s.amountBase === s.amount)).toBe(true)
    })
  })

  describe("createExpense foreign currency conversion", () => {
    it("converts amount and each split to amountBase via the CBR-cached rate and stores currency/date", async () => {
      await seedRates()
      const [admin, member] = await Promise.all([makeUser("Fx Admin"), makeUser("Fx Member")])
      const group = await createGroup(admin.id, {
        name: "Foreign group",
        type: "TRIP",
        currency: "RUB",
        memberIds: [member.id],
      })

      const expense = await createExpense(
        group.id,
        admin.id,
        expenseInput({
          amount: 10_000,
          currency: "USD",
          paidById: admin.id,
          splitType: "EQUAL",
          splits: [{ userId: admin.id }, { userId: member.id }],
        })
      )

      // USD rate 90 → amountBase = round(amount * 90)
      expect(expense.currency).toBe("USD")
      expect(expense.amount).toBe(10_000)
      expect(expense.amountBase).toBe(900_000)
      expect(expense.customRate).toBeNull()
      expect(expense.date).toEqual(new Date(EXPENSE_DATE_ISO))

      const splits = await prisma.expenseSplit.findMany({ where: { expenseId: expense.id } })
      // 5000 each → base round(5000*90)=450000 each, summing to the expense base
      expect(splits.every((s) => s.amount === 5_000)).toBe(true)
      expect(splits.every((s) => s.amountBase === 450_000)).toBe(true)
      expect(splits.reduce((acc, s) => acc + (s.amountBase ?? 0), 0)).toBe(900_000)
    })

    it("customRate overrides the CBR rate as the conversion factor and is stored", async () => {
      await seedRates()
      const [admin, member] = await Promise.all([makeUser("Cr Admin"), makeUser("Cr Member")])
      const group = await createGroup(admin.id, {
        name: "Custom rate group",
        type: "TRIP",
        currency: "RUB",
        memberIds: [member.id],
      })

      const expense = await createExpense(
        group.id,
        admin.id,
        expenseInput({
          amount: 10_000,
          currency: "USD",
          customRate: 100,
          paidById: admin.id,
          splitType: "EQUAL",
          splits: [{ userId: admin.id }, { userId: member.id }],
        })
      )

      // customRate 100 is used instead of the seeded CBR rate 90
      expect(expense.customRate).toBe(100)
      expect(expense.amountBase).toBe(1_000_000)

      const splits = await prisma.expenseSplit.findMany({ where: { expenseId: expense.id } })
      expect(splits.every((s) => s.amountBase === 500_000)).toBe(true)
    })
  })

  describe("createExpense permission and membership guards", () => {
    it("rejects a non-member actor, a non-member payer, and a non-member split participant", async () => {
      const [admin, member, outsider] = await Promise.all([
        makeUser("Guard Admin"),
        makeUser("Guard Member"),
        makeUser("Guard Outsider"),
      ])
      const group = await createGroup(admin.id, {
        name: "Guarded group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })

      // actor is not a member of the group
      await expect(
        createExpense(
          group.id,
          outsider.id,
          expenseInput({
            paidById: admin.id,
            splits: [{ userId: admin.id }, { userId: member.id }],
          })
        )
      ).rejects.toThrow("FORBIDDEN")

      // payer is not an active member
      await expect(
        createExpense(
          group.id,
          admin.id,
          expenseInput({
            paidById: outsider.id,
            splits: [{ userId: admin.id }, { userId: member.id }],
          })
        )
      ).rejects.toThrow("PAYER_NOT_MEMBER")

      // a split participant is not a member
      await expect(
        createExpense(
          group.id,
          admin.id,
          expenseInput({
            paidById: admin.id,
            splits: [{ userId: admin.id }, { userId: outsider.id }],
          })
        )
      ).rejects.toThrow("SPLIT_USER_NOT_MEMBER")
    })
  })

  describe("createExpense inline cash payments", () => {
    it("settles the debtor to zero and creates a settlement row linked to the expense", async () => {
      const [admin, member] = await Promise.all([makeUser("Cash Admin"), makeUser("Cash Member")])
      const group = await createGroup(admin.id, {
        name: "Cash group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })

      const expense = await createExpense(
        group.id,
        admin.id,
        expenseInput({
          amount: 10_000,
          paidById: admin.id,
          splitType: "EQUAL",
          splits: [{ userId: admin.id }, { userId: member.id }],
          cashPayments: [{ userId: member.id, amount: 5_000 }],
        })
      )

      // member owed admin 5000, but paid it in cash on the spot → nothing left
      expect(await getOutstandingDebt(group.id, member.id, admin.id)).toBe(0)

      const settlement = await prisma.settlement.findFirst({
        where: { expenseId: expense.id },
      })
      expect(settlement).not.toBeNull()
      expect(settlement?.fromUserId).toBe(member.id)
      expect(settlement?.toUserId).toBe(admin.id)
      expect(settlement?.amount).toBe(5_000)
      expect(settlement?.expenseId).toBe(expense.id)
    })

    it("re-validates cash payments at the service level (data that bypasses Zod still throws)", async () => {
      const [admin, member] = await Promise.all([makeUser("Bad Admin"), makeUser("Bad Member")])
      const group = await createGroup(admin.id, {
        name: "Bad cash group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })

      const base = () =>
        expenseInput({
          amount: 10_000,
          paidById: admin.id,
          splitType: "EQUAL",
          splits: [{ userId: admin.id }, { userId: member.id }],
        })

      // cash amount larger than the participant's 5000 share
      await expect(
        createExpense(group.id, admin.id, {
          ...base(),
          cashPayments: [{ userId: member.id, amount: 6_000 }],
        })
      ).rejects.toThrow("CASH_PAYMENT_INVALID")

      // the expense payer cannot also be a cash payer
      await expect(
        createExpense(group.id, admin.id, {
          ...base(),
          cashPayments: [{ userId: admin.id, amount: 1_000 }],
        })
      ).rejects.toThrow("CASH_PAYMENT_INVALID")

      // a participant cannot pay cash twice
      await expect(
        createExpense(group.id, admin.id, {
          ...base(),
          cashPayments: [
            { userId: member.id, amount: 2_000 },
            { userId: member.id, amount: 2_000 },
          ],
        })
      ).rejects.toThrow("CASH_PAYMENT_INVALID")
    })
  })

  describe("activity log", () => {
    it("writes exactly one EXPENSE_CREATED entry for the group on create", async () => {
      const [admin, member] = await Promise.all([makeUser("Log Admin"), makeUser("Log Member")])
      const group = await createGroup(admin.id, {
        name: "Log group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })

      const expense = await createExpense(
        group.id,
        admin.id,
        expenseInput({
          paidById: admin.id,
          splits: [{ userId: admin.id }, { userId: member.id }],
        })
      )

      expect(
        await prisma.activityLog.count({
          where: {
            groupId: group.id,
            type: "EXPENSE_CREATED",
            entityType: "expense",
            entityId: expense.id,
          },
        })
      ).toBe(1)
    })
  })

  describe("updateExpense permissions and recomputation", () => {
    it("permits only author, payer, or group ADMIN; a plain member or outsider is FORBIDDEN", async () => {
      const [admin, author, payer, plain, outsider] = await Promise.all([
        makeUser("Upd Admin"),
        makeUser("Upd Author"),
        makeUser("Upd Payer"),
        makeUser("Upd Plain"),
        makeUser("Upd Outsider"),
      ])
      const group = await createGroup(admin.id, {
        name: "Update perms group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [author.id, payer.id, plain.id],
      })

      const expense = await createExpense(
        group.id,
        author.id,
        expenseInput({
          amount: 10_000,
          paidById: payer.id,
          splitType: "EQUAL",
          splits: [{ userId: payer.id }, { userId: plain.id }],
        })
      )

      const editData = (title: string) =>
        expenseInput({
          title,
          amount: 10_000,
          paidById: payer.id,
          splitType: "EQUAL",
          splits: [{ userId: payer.id }, { userId: plain.id }],
        })

      // a plain member who is neither author nor payer nor admin
      await expect(updateExpense(expense.id, plain.id, editData("nope"))).rejects.toThrow("FORBIDDEN")
      // a non-member of the group
      await expect(updateExpense(expense.id, outsider.id, editData("nope"))).rejects.toThrow("FORBIDDEN")

      // author, payer and admin are all allowed
      await expect(updateExpense(expense.id, author.id, editData("by author"))).resolves.toMatchObject({
        title: "by author",
      })
      await expect(updateExpense(expense.id, payer.id, editData("by payer"))).resolves.toMatchObject({
        title: "by payer",
      })
      await expect(updateExpense(expense.id, admin.id, editData("by admin"))).resolves.toMatchObject({
        title: "by admin",
      })
    })

    it("recomputes balances when the amount changes", async () => {
      const [admin, member] = await Promise.all([makeUser("Rc Admin"), makeUser("Rc Member")])
      const group = await createGroup(admin.id, {
        name: "Recompute group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })

      const expense = await createExpense(
        group.id,
        admin.id,
        expenseInput({
          amount: 10_000,
          paidById: admin.id,
          splitType: "EQUAL",
          splits: [{ userId: admin.id }, { userId: member.id }],
        })
      )
      expect(await getOutstandingDebt(group.id, member.id, admin.id)).toBe(5_000)

      await updateExpense(
        expense.id,
        admin.id,
        expenseInput({
          amount: 20_000,
          paidById: admin.id,
          splitType: "EQUAL",
          splits: [{ userId: admin.id }, { userId: member.id }],
        })
      )
      expect(await getOutstandingDebt(group.id, member.id, admin.id)).toBe(10_000)
    })

    it("rejects cashPayments supplied to updateExpense with CASH_PAYMENTS_CREATE_ONLY", async () => {
      const [admin, member] = await Promise.all([makeUser("Uc Admin"), makeUser("Uc Member")])
      const group = await createGroup(admin.id, {
        name: "Update cash group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })

      const expense = await createExpense(
        group.id,
        admin.id,
        expenseInput({
          amount: 10_000,
          paidById: admin.id,
          splitType: "EQUAL",
          splits: [{ userId: admin.id }, { userId: member.id }],
        })
      )

      await expect(
        updateExpense(expense.id, admin.id, {
          ...expenseInput({
            amount: 10_000,
            paidById: admin.id,
            splitType: "EQUAL",
            splits: [{ userId: admin.id }, { userId: member.id }],
          }),
          cashPayments: [{ userId: member.id, amount: 5_000 }],
        })
      ).rejects.toThrow("CASH_PAYMENTS_CREATE_ONLY")
    })
  })

  describe("deleteExpense permissions and cleanup", () => {
    it("permits only the author or an ADMIN; others are FORBIDDEN, and cleanup zeroes the balance", async () => {
      const [admin, author, payer, plain, outsider] = await Promise.all([
        makeUser("Del Admin"),
        makeUser("Del Author"),
        makeUser("Del Payer"),
        makeUser("Del Plain"),
        makeUser("Del Outsider"),
      ])
      const group = await createGroup(admin.id, {
        name: "Delete perms group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [author.id, payer.id, plain.id],
      })

      const expense = await createExpense(
        group.id,
        author.id,
        expenseInput({
          amount: 10_000,
          paidById: payer.id,
          splitType: "EQUAL",
          splits: [{ userId: payer.id }, { userId: plain.id }],
        })
      )
      expect(await getOutstandingDebt(group.id, plain.id, payer.id)).toBe(5_000)

      // a plain member cannot delete
      await expect(deleteExpense(expense.id, plain.id)).rejects.toThrow("FORBIDDEN")
      // the payer, though allowed to *edit*, is not the author and cannot delete
      await expect(deleteExpense(expense.id, payer.id)).rejects.toThrow("FORBIDDEN")
      // a non-member cannot delete
      await expect(deleteExpense(expense.id, outsider.id)).rejects.toThrow("FORBIDDEN")

      // the author (createdById) can delete
      await deleteExpense(expense.id, author.id)
      expect(await getOutstandingDebt(group.id, plain.id, payer.id)).toBe(0)
      expect(await getExpense(expense.id, author.id)).toBeNull()
      expect(await prisma.expense.count({ where: { id: expense.id } })).toBe(0)
    })

    it("allows a group ADMIN who is not the author to delete", async () => {
      const [admin, author, member] = await Promise.all([
        makeUser("DelA Admin"),
        makeUser("DelA Author"),
        makeUser("DelA Member"),
      ])
      const group = await createGroup(admin.id, {
        name: "Admin delete group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [author.id, member.id],
      })

      const expense = await createExpense(
        group.id,
        author.id,
        expenseInput({
          amount: 10_000,
          paidById: author.id,
          splitType: "EQUAL",
          splits: [{ userId: author.id }, { userId: member.id }],
        })
      )

      await deleteExpense(expense.id, admin.id)
      expect(await prisma.expense.count({ where: { id: expense.id } })).toBe(0)
    })
  })

  describe("statistic-fact reconciliation on edit", () => {
    it("keeps exactly one SPLIT_* fact for the creator across EQUAL → EXACT → PERCENTAGE edits", async () => {
      const [admin, member] = await Promise.all([makeUser("St Admin"), makeUser("St Member")])
      const group = await createGroup(admin.id, {
        name: "Split reconcile group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })

      const expense = await createExpense(
        group.id,
        admin.id,
        expenseInput({
          amount: 10_000,
          paidById: admin.id,
          splitType: "EQUAL",
          splits: [{ userId: admin.id }, { userId: member.id }],
        })
      )

      await updateExpense(
        expense.id,
        admin.id,
        expenseInput({
          amount: 10_000,
          paidById: admin.id,
          splitType: "EXACT",
          splits: [
            { userId: admin.id, amount: 5_000 },
            { userId: member.id, amount: 5_000 },
          ],
        })
      )

      await updateExpense(
        expense.id,
        admin.id,
        expenseInput({
          amount: 10_000,
          paidById: admin.id,
          splitType: "PERCENTAGE",
          splits: [
            { userId: admin.id, percentage: 5_000 },
            { userId: member.id, percentage: 5_000 },
          ],
        })
      )

      const splitFacts = await prisma.userStatisticFact.findMany({
        where: { userId: admin.id, kind: { startsWith: "SPLIT_" } },
      })
      // The bug this guards against: stale SPLIT_EQUAL / SPLIT_EXACT facts must
      // be reconciled away, leaving only the current split type.
      expect(splitFacts).toHaveLength(1)
      expect(splitFacts[0].kind).toBe("SPLIT_PERCENTAGE")
      expect(splitFacts[0].reference).toBe(expense.id)
    })

    it("moves the EXPENSE_PAID fact to the new payer when the payer changes", async () => {
      const [admin, member] = await Promise.all([makeUser("Pay Admin"), makeUser("Pay Member")])
      const group = await createGroup(admin.id, {
        name: "Payer reconcile group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })

      const expense = await createExpense(
        group.id,
        admin.id,
        expenseInput({
          amount: 10_000,
          paidById: admin.id,
          splitType: "EQUAL",
          splits: [{ userId: admin.id }, { userId: member.id }],
        })
      )

      await updateExpense(
        expense.id,
        admin.id,
        expenseInput({
          amount: 10_000,
          paidById: member.id,
          splitType: "EQUAL",
          splits: [{ userId: admin.id }, { userId: member.id }],
        })
      )

      const paidFacts = await prisma.userStatisticFact.findMany({
        where: { kind: "EXPENSE_PAID", reference: expense.id },
      })
      expect(paidFacts).toHaveLength(1)
      expect(paidFacts[0].userId).toBe(member.id)
    })

    it("leaves only the current currency fact when the expense currency changes", async () => {
      await seedRates()
      const [admin, member] = await Promise.all([makeUser("Cur Admin"), makeUser("Cur Member")])
      const group = await createGroup(admin.id, {
        name: "Currency reconcile group",
        type: "TRIP",
        currency: "RUB",
        memberIds: [member.id],
      })

      const expense = await createExpense(
        group.id,
        admin.id,
        expenseInput({
          amount: 10_000,
          currency: "RUB",
          paidById: admin.id,
          splitType: "EQUAL",
          splits: [{ userId: admin.id }, { userId: member.id }],
        })
      )

      await updateExpense(
        expense.id,
        admin.id,
        expenseInput({
          amount: 10_000,
          currency: "USD",
          paidById: admin.id,
          splitType: "EQUAL",
          splits: [{ userId: admin.id }, { userId: member.id }],
        })
      )

      const currencyFacts = await prisma.userStatisticFact.findMany({
        where: { userId: admin.id, kind: "CURRENCY" },
      })
      // The RUB currency fact from before the edit must be reconciled away.
      expect(currencyFacts).toHaveLength(1)
      expect(currencyFacts[0].reference).toBe("USD")
    })
  })

  // Наличные — часть траты: при правке валюты/плательщика/даты связанные
  // расчёты (expenseId != null) должны меняться вместе с тратой.
  describe("updateExpense reconciles existing cash-linked settlements", () => {
    it("rewrites the linked settlement's currency and amountBase when the expense currency changes", async () => {
      await seedRates()
      const [a, b, c] = await Promise.all([makeUser("Cx A"), makeUser("Cx B"), makeUser("Cx C")])
      const group = await createGroup(a.id, {
        name: "Cash edit group",
        type: "TRIP",
        currency: "RUB",
        memberIds: [b.id, c.id],
      })

      const expense = await createExpense(
        group.id,
        a.id,
        expenseInput({
          amount: 9_000,
          currency: "RUB",
          paidById: a.id,
          splitType: "EQUAL",
          splits: [{ userId: a.id }, { userId: b.id }, { userId: c.id }],
          cashPayments: [{ userId: b.id, amount: 3_000 }],
        })
      )

      // Linked settlement created in RUB: amount 3000, amountBase 3000, to the payer.
      const before = await prisma.settlement.findFirst({ where: { expenseId: expense.id } })
      expect(before?.currency).toBe("RUB")
      expect(before?.amountBase).toBe(3_000)
      expect(before?.toUserId).toBe(a.id)

      // Edit currency RUB → USD (factor 90). Cash amount stays 3000 (now USD), so it
      // still equals b's new share (9000 USD / 3), and the settlement is rewritten.
      await updateExpense(
        expense.id,
        a.id,
        expenseInput({
          amount: 9_000,
          currency: "USD",
          paidById: a.id,
          splitType: "EQUAL",
          splits: [{ userId: a.id }, { userId: b.id }, { userId: c.id }],
        })
      )

      const after = await prisma.settlement.findFirst({ where: { expenseId: expense.id } })
      expect(after?.currency).toBe("USD")
      expect(after?.amountBase).toBe(270_000) // 3000 * 90
      expect(after?.toUserId).toBe(a.id)

      // b's cash (270000 base) still covers b's share (270000) → b cleared; c owes 270000.
      expect(await getOutstandingDebt(group.id, b.id, a.id)).toBe(0)
      expect(await getOutstandingDebt(group.id, c.id, a.id)).toBe(270_000)

      // recordSettlementHistory ran on the updated settlement (cash settlement fact exists).
      const cashFacts = await prisma.userStatisticFact.count({
        where: { userId: b.id, kind: "CASH_SETTLEMENT" },
      })
      expect(cashFacts).toBeGreaterThanOrEqual(1)
    })

    it("repoints the linked settlement to the new payer when the payer changes", async () => {
      const [a, b, c] = await Promise.all([makeUser("Pp A"), makeUser("Pp B"), makeUser("Pp C")])
      const group = await createGroup(a.id, {
        name: "Cash payer edit",
        type: "TRIP",
        currency: "RUB",
        memberIds: [b.id, c.id],
      })

      const expense = await createExpense(
        group.id,
        a.id,
        expenseInput({
          amount: 9_000,
          currency: "RUB",
          paidById: a.id,
          splitType: "EQUAL",
          splits: [{ userId: a.id }, { userId: b.id }, { userId: c.id }],
          cashPayments: [{ userId: b.id, amount: 3_000 }],
        })
      )

      // Change payer to c (b was the cash payer; c is a valid new payer).
      await updateExpense(
        expense.id,
        a.id,
        expenseInput({
          amount: 9_000,
          currency: "RUB",
          paidById: c.id,
          splitType: "EQUAL",
          splits: [{ userId: a.id }, { userId: b.id }, { userId: c.id }],
        })
      )

      const after = await prisma.settlement.findFirst({ where: { expenseId: expense.id } })
      expect(after?.toUserId).toBe(c.id) // settlement now points at the new payer
      expect(after?.fromUserId).toBe(b.id)
    })

    it("rejects an edit that shrinks a participant's share below their existing cash", async () => {
      const [a, b, c] = await Promise.all([makeUser("Sh A"), makeUser("Sh B"), makeUser("Sh C")])
      const group = await createGroup(a.id, {
        name: "Cash shrink",
        type: "TRIP",
        currency: "RUB",
        memberIds: [b.id, c.id],
      })

      const expense = await createExpense(
        group.id,
        a.id,
        expenseInput({
          amount: 9_000,
          currency: "RUB",
          paidById: a.id,
          splitType: "EQUAL",
          splits: [{ userId: a.id }, { userId: b.id }, { userId: c.id }],
          cashPayments: [{ userId: b.id, amount: 3_000 }], // b share 3000, cash 3000
        })
      )

      // Shrink total to 3000 → each share 1000 < b's existing cash 3000 → invalid.
      await expect(
        updateExpense(
          expense.id,
          a.id,
          expenseInput({
            amount: 3_000,
            currency: "RUB",
            paidById: a.id,
            splitType: "EQUAL",
            splits: [{ userId: a.id }, { userId: b.id }, { userId: c.id }],
          })
        )
      ).rejects.toThrow("CASH_PAYMENT_INVALID")
    })
  })

  describe("getGroupExpenses (чтение списка)", () => {
    it("не-участник получает FORBIDDEN, участник — страницу с пагинацией", async () => {
      const [a, b, outsider] = await Promise.all([
        makeUser("List Admin"),
        makeUser("List Member"),
        makeUser("List Outsider"),
      ])
      const group = await createGroup(a.id, {
        name: `${testPrefix}-list`,
        type: "OTHER",
        currency: "RUB",
        memberIds: [b.id],
      })
      // две траты, чтобы проверить hasNext при perPage=1
      for (const title of ["Первая", "Вторая"]) {
        await createExpense(group.id, a.id, expenseInput({
          title,
          amount: 20_000,
          paidById: a.id,
          splits: [{ userId: a.id }, { userId: b.id }],
        }))
      }

      await expect(getGroupExpenses(group.id, outsider.id)).rejects.toThrow("FORBIDDEN")

      const page1 = await getGroupExpenses(group.id, a.id, 1, 1)
      expect(page1.total).toBe(2)
      expect(page1.expenses).toHaveLength(1)
      expect(page1.hasNext).toBe(true)

      const page2 = await getGroupExpenses(group.id, a.id, 2, 1)
      expect(page2.expenses).toHaveLength(1)
      expect(page2.hasNext).toBe(false)
    })
  })

  describe("getExpense (доступ к одной трате)", () => {
    it("возвращает null для несуществующей траты и для не-участника (не бросает)", async () => {
      const [a, b, outsider] = await Promise.all([
        makeUser("Get Admin"),
        makeUser("Get Member"),
        makeUser("Get Outsider"),
      ])
      const group = await createGroup(a.id, {
        name: `${testPrefix}-get`,
        type: "OTHER",
        currency: "RUB",
        memberIds: [b.id],
      })
      const expense = await createExpense(group.id, a.id, expenseInput({
        title: "Видна только своим",
        amount: 10_000,
        paidById: a.id,
        splits: [{ userId: a.id }, { userId: b.id }],
      }))

      expect(await getExpense("does-not-exist", a.id)).toBeNull()
      // не-участник не получает ошибку — просто null (трата для него не видна)
      expect(await getExpense(expense.id, outsider.id)).toBeNull()
      // участник видит
      expect(await getExpense(expense.id, b.id)).not.toBeNull()
    })
  })

  describe("гард-ветки NOT_FOUND", () => {
    it("createExpense в несуществующей группе → NOT_FOUND", async () => {
      const a = await makeUser("NF Creator")
      await expect(
        createExpense("no-such-group", a.id, expenseInput({
          title: "x",
          amount: 10_000,
          paidById: a.id,
          splits: [{ userId: a.id }],
        }))
      ).rejects.toThrow("NOT_FOUND")
    })

    it("update/delete несуществующей траты → NOT_FOUND", async () => {
      const a = await makeUser("NF Editor")
      await expect(
        updateExpense("no-such-expense", a.id, expenseInput({
          title: "x",
          amount: 10_000,
          paidById: a.id,
          splits: [{ userId: a.id }],
        }))
      ).rejects.toThrow("NOT_FOUND")
      await expect(deleteExpense("no-such-expense", a.id)).rejects.toThrow("NOT_FOUND")
    })
  })

  describe("удаление траты со связанным наличным расчётом", () => {
    it("каскадом удаляет связанный по expenseId расчёт (onDelete: Cascade)", async () => {
      const [a, b] = await Promise.all([makeUser("Cash Admin"), makeUser("Cash Member")])
      const group = await createGroup(a.id, {
        name: `${testPrefix}-cash-del`,
        type: "OTHER",
        currency: "RUB",
        memberIds: [b.id],
      })
      // наличный платёж b на месте создаёт settlement, связанный с тратой (expenseId)
      const expense = await createExpense(group.id, a.id, expenseInput({
        title: "Ужин с наличными",
        amount: 20_000,
        paidById: a.id,
        splits: [{ userId: a.id }, { userId: b.id }],
        cashPayments: [{ userId: b.id, amount: 10_000 }],
      }))

      expect(await prisma.settlement.count({ where: { expenseId: expense.id } })).toBe(1)

      await deleteExpense(expense.id, a.id)

      // трата удалена, а связанный наличный расчёт ушёл каскадом
      expect(await getExpense(expense.id, a.id)).toBeNull()
      expect(await prisma.settlement.count({ where: { expenseId: expense.id } })).toBe(0)
    })
  })
})
