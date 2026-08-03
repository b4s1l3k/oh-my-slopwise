import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import { createExpense } from "@/services/expenses.service"
import { createGroup } from "@/services/groups.service"
import { getOutstandingDebt } from "@/services/balances.service"
import {
  createSettlement,
  getGroupSettlements,
  resetSettlements,
} from "@/services/settlements.service"

// Behavioral SPEC for a future rewrite: these tests assert the ACTUAL current
// behavior of the settlements service against a real database.
const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === "true"
const describeDatabase = runDatabaseTests ? describe : describe.skip
const testPrefix = `settlements-service-${Date.now()}`

const SETTLE_DATE = "2026-06-01T12:00:00.000Z"

let userCounter = 0
async function createUser(name: string) {
  userCounter += 1
  return prisma.user.create({
    data: {
      email: `${testPrefix}-${userCounter}@example.com`,
      name,
      passwordHash: "test-only",
    },
  })
}

// Creates a RUB group in which `debtor` (an ADMIN, the creator) owes `creditor`
// exactly `debt`. The creditor pays an expense whose only split is the debtor.
async function makeDebtGroup(
  debtor: { id: string },
  creditor: { id: string },
  debt: number,
  name = "Debt group"
) {
  const group = await createGroup(debtor.id, {
    name,
    type: "OTHER",
    currency: "RUB",
    memberIds: [creditor.id],
  })
  await createExpense(group.id, debtor.id, {
    title: "Seed debt",
    amount: debt,
    currency: "RUB",
    date: SETTLE_DATE,
    paidById: creditor.id,
    splitType: "EQUAL",
    splits: [{ userId: debtor.id }],
  })
  return group
}

describeDatabase("settlements service (DB-backed behavioral spec)", () => {
  afterAll(async () => {
    await prisma.group.deleteMany({
      where: { createdBy: { email: { startsWith: testPrefix } } },
    })
    await prisma.user.deleteMany({
      where: { email: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
  })

  describe("createSettlement", () => {
    it("records a settlement in the group currency, reduces the debt, and logs the activity", async () => {
      const [payer, recipient] = await Promise.all([
        createUser("Happy Payer"),
        createUser("Happy Recipient"),
      ])
      const group = await makeDebtGroup(payer, recipient, 500)

      expect(await getOutstandingDebt(group.id, payer.id, recipient.id)).toBe(500)

      const settlement = await createSettlement(payer.id, {
        groupId: group.id,
        toUserId: recipient.id,
        amount: 200,
        currency: "RUB",
        date: SETTLE_DATE,
      })

      // расчёт всегда в валюте расчёта группы → amount === amountBase
      expect(settlement).toMatchObject({
        fromUserId: payer.id,
        toUserId: recipient.id,
        amount: 200,
        amountBase: 200,
        currency: "RUB",
      })

      // A partial payment leaves the remainder outstanding.
      expect(await getOutstandingDebt(group.id, payer.id, recipient.id)).toBe(300)

      const logs = await prisma.activityLog.count({
        where: {
          groupId: group.id,
          type: "SETTLEMENT_CREATED",
          entityType: "settlement",
          entityId: settlement.id,
        },
      })
      expect(logs).toBe(1)
    })

    it("clears the debt to zero when paying exactly the outstanding amount", async () => {
      const [payer, recipient] = await Promise.all([
        createUser("Exact Payer"),
        createUser("Exact Recipient"),
      ])
      const group = await makeDebtGroup(payer, recipient, 500)

      await createSettlement(payer.id, {
        groupId: group.id,
        toUserId: recipient.id,
        amount: 500,
        currency: "RUB",
        date: SETTLE_DATE,
      })

      expect(await getOutstandingDebt(group.id, payer.id, recipient.id)).toBe(0)
    })

    it("rejects paying yourself with SELF_SETTLEMENT", async () => {
      const [payer, recipient] = await Promise.all([
        createUser("Self Payer"),
        createUser("Self Recipient"),
      ])
      const group = await makeDebtGroup(payer, recipient, 500)

      await expect(
        createSettlement(payer.id, {
          groupId: group.id,
          toUserId: payer.id,
          amount: 100,
          currency: "RUB",
          date: SETTLE_DATE,
        })
      ).rejects.toThrow("SELF_SETTLEMENT")
    })

    it("rejects a recipient who is not an active member with RECIPIENT_NOT_MEMBER", async () => {
      const [payer, recipient, outsider] = await Promise.all([
        createUser("Payer With Outsider"),
        createUser("Recipient With Outsider"),
        createUser("Outsider Recipient"),
      ])
      const group = await makeDebtGroup(payer, recipient, 500)

      await expect(
        createSettlement(payer.id, {
          groupId: group.id,
          toUserId: outsider.id,
          amount: 100,
          currency: "RUB",
          date: SETTLE_DATE,
        })
      ).rejects.toThrow("RECIPIENT_NOT_MEMBER")
    })

    it("rejects an actor who is not a member with FORBIDDEN", async () => {
      const [payer, recipient, outsider] = await Promise.all([
        createUser("Payer NonActor"),
        createUser("Recipient NonActor"),
        createUser("Outsider Actor"),
      ])
      const group = await makeDebtGroup(payer, recipient, 500)

      await expect(
        createSettlement(outsider.id, {
          groupId: group.id,
          toUserId: recipient.id,
          amount: 100,
          currency: "RUB",
          date: SETTLE_DATE,
        })
      ).rejects.toThrow("FORBIDDEN")
    })

    it("rejects settling when there is no debt with NO_DEBT", async () => {
      const [admin, member] = await Promise.all([
        createUser("No Debt Admin"),
        createUser("No Debt Member"),
      ])
      const group = await createGroup(admin.id, {
        name: "No debt group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })

      await expect(
        createSettlement(admin.id, {
          groupId: group.id,
          toUserId: member.id,
          amount: 100,
          currency: "RUB",
          date: SETTLE_DATE,
        })
      ).rejects.toThrow("NO_DEBT")
    })

    it("rejects an amount larger than the outstanding debt with AMOUNT_EXCEEDS_DEBT", async () => {
      const [payer, recipient] = await Promise.all([
        createUser("Excess Payer"),
        createUser("Excess Recipient"),
      ])
      const group = await makeDebtGroup(payer, recipient, 500)

      await expect(
        createSettlement(payer.id, {
          groupId: group.id,
          toUserId: recipient.id,
          amount: 600,
          currency: "RUB",
          date: SETTLE_DATE,
        })
      ).rejects.toThrow("AMOUNT_EXCEEDS_DEBT")

      // Nothing was recorded when the guard rejects.
      expect(await getOutstandingDebt(group.id, payer.id, recipient.id)).toBe(500)
    })
  })

  describe("resetSettlements", () => {
    // Builds a group holding one cash-on-spot settlement (expenseId set) and one
    // manual settlement (expenseId null).
    async function makeGroupWithBothSettlements() {
      const [admin, member] = await Promise.all([
        createUser("Reset Admin"),
        createUser("Reset Member"),
      ])
      const group = await createGroup(admin.id, {
        name: "Reset group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      })

      // Cash-on-spot: member repays 500 of a 1000 expense at the moment of the
      // expense → a settlement linked to that expense (expenseId set).
      const cashExpense = await createExpense(group.id, admin.id, {
        title: "Cash expense",
        amount: 1000,
        currency: "RUB",
        date: SETTLE_DATE,
        paidById: admin.id,
        splitType: "EQUAL",
        splits: [{ userId: admin.id }, { userId: member.id }],
        cashPayments: [{ userId: member.id, amount: 500 }],
      })

      // Now the admin owes the member 300 (member pays, admin is the only split).
      await createExpense(group.id, admin.id, {
        title: "Admin owes member",
        amount: 300,
        currency: "RUB",
        date: SETTLE_DATE,
        paidById: member.id,
        splitType: "EQUAL",
        splits: [{ userId: admin.id }],
      })
      const manual = await createSettlement(admin.id, {
        groupId: group.id,
        toUserId: member.id,
        amount: 300,
        currency: "RUB",
        date: SETTLE_DATE,
      })

      const cash = await prisma.settlement.findFirstOrThrow({
        where: { expenseId: cashExpense.id },
      })
      return { admin, member, group, cash, manual }
    }

    it("forbids a non-admin member from resetting settlements", async () => {
      const { member, group } = await makeGroupWithBothSettlements()
      await expect(resetSettlements(group.id, member.id)).rejects.toThrow("FORBIDDEN")
    })

    it("deletes only manual settlements, keeps cash-on-spot ones, and logs when n>0", async () => {
      const { admin, group, cash, manual } = await makeGroupWithBothSettlements()

      const result = await resetSettlements(group.id, admin.id)
      expect(result).toEqual({ removed: 1 })

      // Manual settlement (expenseId null) removed; cash settlement kept intact.
      expect(await prisma.settlement.count({ where: { id: manual.id } })).toBe(0)
      expect(await prisma.settlement.count({ where: { id: cash.id } })).toBe(1)

      expect(
        await prisma.activityLog.count({
          where: { groupId: group.id, type: "SETTLEMENTS_RESET" },
        })
      ).toBe(1)
    })

    it("returns removed 0 and writes no SETTLEMENTS_RESET log when there is nothing to remove", async () => {
      const admin = await createUser("Empty Reset Admin")
      const group = await createGroup(admin.id, {
        name: "Empty reset group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [],
      })

      const result = await resetSettlements(group.id, admin.id)
      expect(result).toEqual({ removed: 0 })
      expect(
        await prisma.activityLog.count({
          where: { groupId: group.id, type: "SETTLEMENTS_RESET" },
        })
      ).toBe(0)
    })
  })

  describe("getGroupSettlements", () => {
    it("returns the group's settlements for a member and forbids non-members", async () => {
      const [payer, recipient, outsider] = await Promise.all([
        createUser("List Payer"),
        createUser("List Recipient"),
        createUser("List Outsider"),
      ])
      const group = await makeDebtGroup(payer, recipient, 500)
      const settlement = await createSettlement(payer.id, {
        groupId: group.id,
        toUserId: recipient.id,
        amount: 500,
        currency: "RUB",
        date: SETTLE_DATE,
      })

      const asMember = await getGroupSettlements(group.id, recipient.id)
      expect(asMember.map((s) => s.id)).toContain(settlement.id)

      await expect(getGroupSettlements(group.id, outsider.id)).rejects.toThrow("FORBIDDEN")
    })
  })
})
