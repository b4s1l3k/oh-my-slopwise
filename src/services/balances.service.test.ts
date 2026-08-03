import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import { createExpense } from "@/services/expenses.service"
import { createGroup } from "@/services/groups.service"
import {
  computeGroupDebts,
  getGroupBalances,
  getOutstandingDebt,
  getOverviewBalances,
} from "@/services/balances.service"

// Behavioral SPEC for a future rewrite: these tests assert the ACTUAL current
// behavior of the balances service against a real database.
const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === "true"
const describeDatabase = runDatabaseTests ? describe : describe.skip
const testPrefix = `balances-service-${Date.now()}`

const EXPENSE_DATE = "2026-06-01T12:00:00.000Z"
// Fixed UTC-midnight date used for the pre-seeded FX rates (schema stores @db.Date).
const FX_DATE = new Date("2026-06-01T00:00:00.000Z")

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

describeDatabase("balances service (DB-backed behavioral spec)", () => {
  afterAll(async () => {
    await prisma.group.deleteMany({
      where: { createdBy: { email: { startsWith: testPrefix } } },
    })
    await prisma.user.deleteMany({
      where: { email: { startsWith: testPrefix } },
    })
    await prisma.exchangeRate.deleteMany({
      where: { date: FX_DATE, currency: { in: ["RUB", "USD"] } },
    })
    await prisma.$disconnect()
  })

  describe("computeGroupDebts", () => {
    it("nets to zero, marks the covering payer as a creditor, and minimizes simplified transfers", async () => {
      const [a, b, c] = await Promise.all([
        createUser("Payer A"),
        createUser("Debtor B"),
        createUser("Debtor C"),
      ])
      const group = await createGroup(a.id, {
        name: "Three-way trip",
        type: "TRIP",
        currency: "RUB",
        memberIds: [b.id, c.id],
      })
      // A covers 900 split equally among the three (300 each).
      await createExpense(group.id, a.id, {
        title: "Dinner for three",
        amount: 900,
        currency: "RUB",
        date: EXPENSE_DATE,
        paidById: a.id,
        splitType: "EQUAL",
        splits: [{ userId: a.id }, { userId: b.id }, { userId: c.id }],
      })

      const { raw, simplified } = await computeGroupDebts(group.id)

      // Raw net balances always sum to zero.
      expect(raw.reduce((sum, r) => sum + r.balance, 0)).toBe(0)

      // The payer who covered others is a creditor (positive balance).
      const rawA = raw.find((r) => r.userId === a.id)
      expect(rawA?.balance).toBe(600)
      expect(raw.find((r) => r.userId === b.id)?.balance).toBe(-300)
      expect(raw.find((r) => r.userId === c.id)?.balance).toBe(-300)

      // Simplified debts minimize transfers (<= participants - 1) and never
      // create a self-debt.
      const participantCount = raw.length
      expect(simplified.length).toBeLessThanOrEqual(participantCount - 1)
      expect(simplified.every((d) => d.fromUserId !== d.toUserId)).toBe(true)

      // The simplified graph always nets out to the raw balances: each user's
      // (received - paid) equals their raw net balance.
      for (const r of raw) {
        const received = simplified
          .filter((d) => d.toUserId === r.userId)
          .reduce((sum, d) => sum + d.amount, 0)
        const paid = simplified
          .filter((d) => d.fromUserId === r.userId)
          .reduce((sum, d) => sum + d.amount, 0)
        expect(received - paid).toBe(r.balance)
      }

      // Both debtors settle straight to the creditor: exactly 2 transfers here.
      expect(simplified).toHaveLength(2)
      expect(simplified.every((d) => d.toUserId === a.id && d.amount === 300)).toBe(true)
    })
  })

  describe("getOutstandingDebt", () => {
    it("returns the simplified from→to amount and 0 when there is none", async () => {
      const [a, b, c] = await Promise.all([
        createUser("Creditor A"),
        createUser("Debtor B2"),
        createUser("Debtor C2"),
      ])
      const group = await createGroup(a.id, {
        name: "Outstanding trip",
        type: "TRIP",
        currency: "RUB",
        memberIds: [b.id, c.id],
      })
      await createExpense(group.id, a.id, {
        title: "Shared lunch",
        amount: 900,
        currency: "RUB",
        date: EXPENSE_DATE,
        paidById: a.id,
        splitType: "EQUAL",
        splits: [{ userId: a.id }, { userId: b.id }, { userId: c.id }],
      })

      // B owes A the simplified amount.
      expect(await getOutstandingDebt(group.id, b.id, a.id)).toBe(300)
      // A does not owe B (reverse direction has no simplified debt).
      expect(await getOutstandingDebt(group.id, a.id, b.id)).toBe(0)
      // Two debtors never owe each other in the simplified graph.
      expect(await getOutstandingDebt(group.id, b.id, c.id)).toBe(0)
    })
  })

  describe("getGroupBalances", () => {
    it("requires active membership and forbids non-members", async () => {
      const [a, b, outsider] = await Promise.all([
        createUser("Balances Admin"),
        createUser("Balances Member"),
        createUser("Balances Outsider"),
      ])
      const group = await createGroup(a.id, {
        name: "Membership group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [b.id],
      })
      await createExpense(group.id, a.id, {
        title: "Split expense",
        amount: 200,
        currency: "RUB",
        date: EXPENSE_DATE,
        paidById: a.id,
        splitType: "EQUAL",
        splits: [{ userId: a.id }, { userId: b.id }],
      })

      const balances = await getGroupBalances(group.id, a.id)
      // Не только форма — проверяем сами суммы: 200 поровну, платил a →
      // a покрыл долю b (100), поэтому a +100, b -100, один перевод b→a на 100.
      expect(balances.raw.find((r) => r.userId === a.id)?.balance).toBe(100)
      expect(balances.raw.find((r) => r.userId === b.id)?.balance).toBe(-100)
      expect(balances.simplified).toEqual([
        expect.objectContaining({ fromUserId: b.id, toUserId: a.id, amount: 100 }),
      ])

      await expect(getGroupBalances(group.id, outsider.id)).rejects.toThrow("FORBIDDEN")
    })
  })

  describe("getOverviewBalances", () => {
    it("aggregates per (friend, currency), keeps currencies separate, and drops zero-net friends", async () => {
      // FX rates are pre-seeded for a fixed UTC-midnight date. Same-currency
      // expenses need no conversion, but we seed to keep the suite FX-free.
      await prisma.exchangeRate.upsert({
        where: { date_currency: { date: FX_DATE, currency: "RUB" } },
        update: { rate: 1 },
        create: { date: FX_DATE, currency: "RUB", rate: 1 },
      })
      await prisma.exchangeRate.upsert({
        where: { date_currency: { date: FX_DATE, currency: "USD" } },
        update: { rate: 90 },
        create: { date: FX_DATE, currency: "USD", rate: 90 },
      })

      const [me, friend, zeroFriend] = await Promise.all([
        createUser("Overview Me"),
        createUser("Overview Friend"),
        createUser("Overview ZeroFriend"),
      ])

      // RUB group: friend owes me (I paid, friend is the only split).
      const rubGroup = await createGroup(me.id, {
        name: "RUB overview group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [friend.id],
      })
      await createExpense(rubGroup.id, me.id, {
        title: "RUB expense",
        amount: 400,
        currency: "RUB",
        date: EXPENSE_DATE,
        paidById: me.id,
        splitType: "EQUAL",
        splits: [{ userId: friend.id }],
      })

      // USD group (settlement currency USD): I owe friend.
      const usdGroup = await createGroup(me.id, {
        name: "USD overview group",
        type: "OTHER",
        currency: "USD",
        memberIds: [friend.id],
      })
      await createExpense(usdGroup.id, me.id, {
        title: "USD expense",
        amount: 300,
        currency: "USD",
        date: FX_DATE.toISOString(),
        paidById: friend.id,
        splitType: "EQUAL",
        splits: [{ userId: me.id }],
      })

      // Two RUB groups whose debts cancel for zeroFriend → net zero, excluded.
      const zeroGroupA = await createGroup(me.id, {
        name: "Zero net group A",
        type: "OTHER",
        currency: "RUB",
        memberIds: [zeroFriend.id],
      })
      await createExpense(zeroGroupA.id, me.id, {
        title: "ZeroFriend owes me",
        amount: 100,
        currency: "RUB",
        date: EXPENSE_DATE,
        paidById: me.id,
        splitType: "EQUAL",
        splits: [{ userId: zeroFriend.id }],
      })
      const zeroGroupB = await createGroup(me.id, {
        name: "Zero net group B",
        type: "OTHER",
        currency: "RUB",
        memberIds: [zeroFriend.id],
      })
      await createExpense(zeroGroupB.id, me.id, {
        title: "I owe ZeroFriend",
        amount: 100,
        currency: "RUB",
        date: EXPENSE_DATE,
        paidById: zeroFriend.id,
        splitType: "EQUAL",
        splits: [{ userId: me.id }],
      })

      const { totals, friendBalances } = await getOverviewBalances(me.id)

      // Friend appears once per currency, never mixed across currencies.
      const rubEntry = friendBalances.find(
        (f) => f.userId === friend.id && f.currency === "RUB"
      )
      const usdEntry = friendBalances.find(
        (f) => f.userId === friend.id && f.currency === "USD"
      )
      // balance > 0 → owed to me; < 0 → I owe.
      expect(rubEntry?.balance).toBe(400)
      expect(usdEntry?.balance).toBe(-300)

      // Zero-net friend is excluded entirely.
      expect(friendBalances.some((f) => f.userId === zeroFriend.id)).toBe(false)

      // Totals are reported separately per currency and never mixed.
      const rubTotal = totals.find((t) => t.currency === "RUB")
      const usdTotal = totals.find((t) => t.currency === "USD")
      expect(rubTotal).toEqual({ currency: "RUB", owed: 400, owe: 0 })
      expect(usdTotal).toEqual({ currency: "USD", owed: 0, owe: 300 })
    })

    it("конвертирует трату в чужой валюте в валюту расчёта группы (amountBase)", async () => {
      // Отдельная спецификация РЕАЛЬНОЙ конвертации: группа считается в RUB, а
      // трата — в USD. customRate=90 задаёт фактор явно (без похода в ЦБ), поэтому
      // amountBase = round(100 * 90) = 9000. Долг друга в овервью — уже в RUB.
      const [me2, friend2] = await Promise.all([
        createUser("Cross Me"),
        createUser("Cross Friend"),
      ])
      const rubGroup = await createGroup(me2.id, {
        name: "Cross-currency RUB group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [friend2.id],
      })
      await createExpense(rubGroup.id, me2.id, {
        title: "USD dinner billed to a RUB group",
        amount: 100,
        currency: "USD",
        customRate: 90,
        date: EXPENSE_DATE,
        paidById: me2.id,
        splitType: "EQUAL",
        splits: [{ userId: friend2.id }],
      })

      const { totals, friendBalances } = await getOverviewBalances(me2.id)

      // Друг должен мне 9000 в ВАЛЮТЕ РАСЧЁТА (RUB), а не 100 в USD.
      const rubEntry = friendBalances.find(
        (f) => f.userId === friend2.id && f.currency === "RUB"
      )
      expect(rubEntry?.balance).toBe(9000)
      expect(friendBalances.some((f) => f.currency === "USD")).toBe(false)
      expect(totals.find((t) => t.currency === "RUB")).toEqual({
        currency: "RUB",
        owed: 9000,
        owe: 0,
      })
    })
  })
})
