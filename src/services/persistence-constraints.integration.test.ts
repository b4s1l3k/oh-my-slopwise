import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import { createExpense } from "@/services/expenses.service"
import { createGroup } from "@/services/groups.service"

const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === "true"
const describeDatabase = runDatabaseTests ? describe : describe.skip
const testPrefix = `persistence-constraints-${Date.now()}`
const operationDate = "2028-05-11"

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

describeDatabase("database constraint contract", () => {
  afterAll(async () => {
    await prisma.group.deleteMany({
      where: { createdBy: { email: { startsWith: testPrefix } } },
    })
    await prisma.user.deleteMany({
      where: { email: { startsWith: testPrefix } },
    })
    await prisma.exchangeRate.deleteMany({
      where: {
        date: new Date(`${operationDate}T00:00:00.000Z`),
        currency: { in: ["ZZZ", "ZZY"] },
      },
    })
    await prisma.$disconnect()
  })

  it("enforces unique user email persistence", async () => {
    const email = `${testPrefix}-unique@example.test`
    await prisma.user.create({
      data: { email, name: "Unique email", passwordHash: "test-only" },
    })

    await expect(
      prisma.user.create({
        data: { email, name: "Duplicate email", passwordHash: "test-only" },
      })
    ).rejects.toMatchObject({ code: "P2002" })

    expect(await prisma.user.count({ where: { email } })).toBe(1)
  })

  it("enforces case-insensitive email uniqueness for every database writer", async () => {
    const email = `${testPrefix}-case@example.test`
    await prisma.user.create({
      data: { email, name: "Normalized email", passwordHash: "test-only" },
    })

    await expect(
      prisma.user.create({
        data: {
          email: email.toUpperCase(),
          name: "Case duplicate",
          passwordHash: "test-only",
        },
      })
    ).rejects.toMatchObject({ code: "P2002" })
  })

  it("enforces one membership per user and group", async () => {
    const [admin, member] = await Promise.all([
      createUser("Membership unique admin"),
      createUser("Membership unique member"),
    ])
    const group = await createGroup(admin.id, {
      name: "Membership uniqueness",
      type: "OTHER",
      currency: "RUB",
      memberIds: [member.id],
    })

    await expect(
      prisma.groupMember.create({
        data: { groupId: group.id, userId: member.id, role: "ADMIN" },
      })
    ).rejects.toMatchObject({ code: "P2002" })
    expect(
      await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: group.id, userId: member.id } },
        select: { role: true, isActive: true },
      })
    ).toEqual({ role: "MEMBER", isActive: true })
  })

  it("enforces one split row per expense participant", async () => {
    const [admin, member] = await Promise.all([
      createUser("Split unique admin"),
      createUser("Split unique member"),
    ])
    const group = await createGroup(admin.id, {
      name: "Split uniqueness",
      type: "OTHER",
      currency: "RUB",
      memberIds: [member.id],
    })
    const expense = await createExpense(group.id, admin.id, {
      title: "Unique split",
      amount: 1_000,
      currency: "RUB",
      date: operationDate,
      paidById: admin.id,
      splitType: "EXACT",
      splits: [{ userId: member.id, amount: 1_000 }],
    })

    await expect(
      prisma.expenseSplit.create({
        data: {
          expenseId: expense.id,
          userId: member.id,
          amount: 1_000,
          amountBase: 1_000,
        },
      })
    ).rejects.toMatchObject({ code: "P2002" })
    expect(await prisma.expenseSplit.count({ where: { expenseId: expense.id } })).toBe(1)
  })

  it("enforces idempotency keys for achievements and statistic facts", async () => {
    const user = await createUser("Fact uniqueness user")
    await prisma.userAchievement.create({
      data: { userId: user.id, achievementId: "constraint-achievement" },
    })
    await prisma.userStatisticFact.create({
      data: { userId: user.id, kind: "CONSTRAINT_KIND", reference: "same-reference" },
    })

    await expect(
      prisma.userAchievement.create({
        data: { userId: user.id, achievementId: "constraint-achievement" },
      })
    ).rejects.toMatchObject({ code: "P2002" })
    await expect(
      prisma.userStatisticFact.create({
        data: { userId: user.id, kind: "CONSTRAINT_KIND", reference: "same-reference" },
      })
    ).rejects.toMatchObject({ code: "P2002" })
    expect(await prisma.userAchievement.count({ where: { userId: user.id } })).toBe(1)
    expect(
      await prisma.userStatisticFact.count({
        where: { userId: user.id, kind: "CONSTRAINT_KIND" },
      })
    ).toBe(1)
  })

  it("enforces global invite-token and daily currency-rate uniqueness", async () => {
    const admin = await createUser("Token uniqueness admin")
    const [firstGroup, secondGroup] = await Promise.all([
      createGroup(admin.id, {
        name: "Token uniqueness one",
        type: "OTHER",
        currency: "RUB",
        memberIds: [],
      }),
      createGroup(admin.id, {
        name: "Token uniqueness two",
        type: "OTHER",
        currency: "RUB",
        memberIds: [],
      }),
    ])
    const token = `${testPrefix}-global-token`
    await prisma.groupInvite.create({
      data: { token, groupId: firstGroup.id, createdById: admin.id },
    })
    await expect(
      prisma.groupInvite.create({
        data: { token, groupId: secondGroup.id, createdById: admin.id },
      })
    ).rejects.toMatchObject({ code: "P2002" })

    const date = new Date("2028-05-11T00:00:00.000Z")
    const currency = "ZZZ"
    await prisma.exchangeRate.create({ data: { date, currency, rate: 12.5 } })
    await expect(
      prisma.exchangeRate.create({ data: { date, currency, rate: 13.5 } })
    ).rejects.toMatchObject({ code: "P2002" })
    expect(Number((await prisma.exchangeRate.findUniqueOrThrow({
      where: { date_currency: { date, currency } },
      select: { rate: true },
    })).rate)).toBe(12.5)
  })

  it("enforces one active invite per group", async () => {
    const admin = await createUser("Active invite admin")
    const group = await createGroup(admin.id, {
      name: "One active invite",
      type: "OTHER",
      currency: "RUB",
      memberIds: [],
    })
    await prisma.groupInvite.create({
      data: {
        token: `${testPrefix}-active-one`,
        groupId: group.id,
        createdById: admin.id,
      },
    })

    await expect(prisma.groupInvite.create({
      data: {
        token: `${testPrefix}-active-two`,
        groupId: group.id,
        createdById: admin.id,
      },
    })).rejects.toMatchObject({ code: "P2002" })

    await prisma.groupInvite.updateMany({ where: { groupId: group.id }, data: { revoked: true } })
    await expect(prisma.groupInvite.create({
      data: {
        token: `${testPrefix}-active-three`,
        groupId: group.id,
        createdById: admin.id,
      },
    })).resolves.toMatchObject({ revoked: false })
  })

  it("rejects non-positive persisted amounts and rates", async () => {
    const admin = await createUser("Positive amount admin")
    const group = await createGroup(admin.id, {
      name: "Positive amounts",
      type: "OTHER",
      currency: "RUB",
      memberIds: [],
    })

    await expect(prisma.expense.create({
      data: {
        groupId: group.id,
        paidById: admin.id,
        createdById: admin.id,
        title: "Invalid negative amount",
        amount: -1,
        amountBase: 1,
        currency: "RUB",
        date: new Date(`${operationDate}T00:00:00.000Z`),
        splits: { create: { userId: admin.id, amount: 1, amountBase: 1 } },
      },
    })).rejects.toBeDefined()
    await expect(prisma.exchangeRate.create({
      data: {
        date: new Date(`${operationDate}T00:00:00.000Z`),
        currency: "ZZY",
        rate: 0,
      },
    })).rejects.toBeDefined()
  })

  it("rejects expense split totals that differ from amountBase", async () => {
    const admin = await createUser("Split total admin")
    const group = await createGroup(admin.id, {
      name: "Split total invariant",
      type: "OTHER",
      currency: "RUB",
      memberIds: [],
    })

    await expect(prisma.expense.create({
      data: {
        groupId: group.id,
        paidById: admin.id,
        createdById: admin.id,
        title: "Mismatched total",
        amount: 100,
        amountBase: 100,
        currency: "RUB",
        date: new Date(`${operationDate}T00:00:00.000Z`),
        splits: { create: { userId: admin.id, amount: 99, amountBase: 99 } },
      },
    })).rejects.toBeDefined()
    expect(await prisma.expense.count({
      where: { groupId: group.id, title: "Mismatched total" },
    })).toBe(0)
  })

  it("enforces original split totals and percentage semantics in the database", async () => {
    const admin = await createUser("Full split invariant admin")
    const group = await createGroup(admin.id, {
      name: "Full split invariant",
      type: "OTHER",
      currency: "RUB",
      memberIds: [],
    })
    const baseData = {
      groupId: group.id,
      paidById: admin.id,
      createdById: admin.id,
      amount: 100,
      amountBase: 100,
      currency: "RUB",
      date: new Date(`${operationDate}T00:00:00.000Z`),
    }

    await expect(prisma.expense.create({
      data: {
        ...baseData,
        title: "Original amount mismatch",
        splitType: "EXACT",
        splits: { create: { userId: admin.id, amount: 99, amountBase: 100 } },
      },
    })).rejects.toBeDefined()
    await expect(prisma.expense.create({
      data: {
        ...baseData,
        title: "Percentage mismatch",
        splitType: "PERCENTAGE",
        splits: {
          create: { userId: admin.id, amount: 100, amountBase: 100, percentage: 9_999 },
        },
      },
    })).rejects.toBeDefined()
    await expect(prisma.expense.create({
      data: {
        ...baseData,
        title: "Percentage on exact split",
        splitType: "EXACT",
        splits: {
          create: { userId: admin.id, amount: 100, amountBase: 100, percentage: 10_000 },
        },
      },
    })).rejects.toBeDefined()
  })

  it("enforces settlement currency and cash-to-split relationships", async () => {
    const [admin, member, other] = await Promise.all([
      createUser("Settlement invariant admin"),
      createUser("Settlement invariant member"),
      createUser("Settlement invariant other"),
    ])
    const group = await createGroup(admin.id, {
      name: "Settlement semantics",
      type: "OTHER",
      currency: "RUB",
      memberIds: [member.id, other.id],
    })
    const expense = await createExpense(group.id, admin.id, {
      title: "Cash source",
      amount: 100,
      currency: "RUB",
      date: operationDate,
      paidById: admin.id,
      splitType: "EXACT",
      splits: [{ userId: member.id, amount: 100 }],
    })
    const date = new Date(`${operationDate}T00:00:00.000Z`)

    await expect(prisma.settlement.create({
      data: {
        groupId: group.id,
        fromUserId: member.id,
        toUserId: admin.id,
        amount: 10,
        amountBase: 9,
        currency: "USD",
        date,
      },
    })).rejects.toBeDefined()
    await expect(prisma.settlement.create({
      data: {
        groupId: group.id,
        expenseId: expense.id,
        fromUserId: member.id,
        toUserId: other.id,
        amount: 10,
        amountBase: 10,
        currency: "RUB",
        date,
      },
    })).rejects.toBeDefined()
    await expect(prisma.settlement.create({
      data: {
        groupId: group.id,
        expenseId: expense.id,
        fromUserId: member.id,
        toUserId: admin.id,
        amount: 101,
        amountBase: 101,
        currency: "RUB",
        date,
      },
    })).rejects.toBeDefined()
  })

  it("protects financial identity and statistic fact semantics from direct writers", async () => {
    const [admin, member] = await Promise.all([
      createUser("Immutable identity admin"),
      createUser("Immutable identity member"),
    ])
    const group = await createGroup(admin.id, {
      name: "Immutable financial identity",
      type: "OTHER",
      currency: "RUB",
      memberIds: [member.id],
    })
    const expense = await createExpense(group.id, admin.id, {
      title: "Immutable cash",
      amount: 100,
      currency: "RUB",
      date: operationDate,
      paidById: admin.id,
      splitType: "EXACT",
      splits: [{ userId: member.id, amount: 100 }],
      cashPayments: [{ userId: member.id, amount: 50 }],
    })
    const cash = await prisma.settlement.findFirstOrThrow({
      where: { expenseId: expense.id },
    })

    await expect(prisma.group.update({
      where: { id: group.id },
      data: { currency: "USD" },
    })).rejects.toBeDefined()
    await expect(prisma.settlement.update({
      where: { id: cash.id },
      data: { amount: cash.amount + 1 },
    })).rejects.toBeDefined()
    await expect(prisma.expense.update({
      where: { id: expense.id },
      data: { paidById: member.id },
    })).rejects.toBeDefined()
    await expect(prisma.userStatisticFact.create({
      data: {
        userId: admin.id,
        kind: "MONEY_SPENT",
        reference: "missing-currency",
        value: 1,
      },
    })).rejects.toBeDefined()
    await expect(prisma.userStatisticFact.create({
      data: {
        userId: admin.id,
        kind: "invalid kind",
        reference: "bad-kind",
      },
    })).rejects.toBeDefined()
  })

  it("rejects expense and settlement participants outside their group", async () => {
    const [admin, member, outsider] = await Promise.all([
      createUser("Participant constraint admin"),
      createUser("Participant constraint member"),
      createUser("Participant constraint outsider"),
    ])
    const group = await createGroup(admin.id, {
      name: "Participant membership invariant",
      type: "OTHER",
      currency: "RUB",
      memberIds: [member.id],
    })

    await expect(prisma.expense.create({
      data: {
        groupId: group.id,
        paidById: outsider.id,
        createdById: admin.id,
        title: "Outsider payer",
        amount: 100,
        amountBase: 100,
        currency: "RUB",
        date: new Date(`${operationDate}T00:00:00.000Z`),
        splits: { create: { userId: member.id, amount: 100, amountBase: 100 } },
      },
    })).rejects.toBeDefined()
    await expect(prisma.settlement.create({
      data: {
        groupId: group.id,
        fromUserId: member.id,
        toUserId: outsider.id,
        amount: 100,
        amountBase: 100,
        currency: "RUB",
        date: new Date(`${operationDate}T00:00:00.000Z`),
      },
    })).rejects.toBeDefined()
  })

  it("rejects linking a settlement to an expense from another group", async () => {
    const [admin, member] = await Promise.all([
      createUser("Cross-group settlement admin"),
      createUser("Cross-group settlement member"),
    ])
    const [sourceGroup, targetGroup] = await Promise.all([
      createGroup(admin.id, {
        name: "Settlement source group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      }),
      createGroup(admin.id, {
        name: "Settlement target group",
        type: "OTHER",
        currency: "RUB",
        memberIds: [member.id],
      }),
    ])
    const expense = await createExpense(sourceGroup.id, admin.id, {
      title: "Source expense",
      amount: 100,
      currency: "RUB",
      date: operationDate,
      paidById: admin.id,
      splitType: "EXACT",
      splits: [{ userId: member.id, amount: 100 }],
    })

    await expect(prisma.settlement.create({
      data: {
        groupId: targetGroup.id,
        expenseId: expense.id,
        fromUserId: member.id,
        toUserId: admin.id,
        amount: 100,
        amountBase: 100,
        currency: "RUB",
        date: new Date(`${operationDate}T00:00:00.000Z`),
      },
    })).rejects.toBeDefined()
  })

  it("updates audit timestamps for writers that bypass Prisma", async () => {
    const admin = await createUser("Raw timestamp admin")
    const group = await createGroup(admin.id, {
      name: "Raw timestamp before",
      type: "OTHER",
      currency: "RUB",
      memberIds: [],
    })

    await prisma.$executeRaw`
      UPDATE "groups"
      SET "name" = 'Raw timestamp after', "updatedAt" = TIMESTAMPTZ '2000-01-01 00:00:00Z'
      WHERE "id" = ${group.id}
    `
    const updated = await prisma.group.findUniqueOrThrow({ where: { id: group.id } })
    expect(updated.name).toBe("Raw timestamp after")
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(group.updatedAt.getTime())
    expect(updated.updatedAt.toISOString()).not.toBe("2000-01-01T00:00:00.000Z")
  })

  it("cascades account-owned achievements and facts when an otherwise unreferenced user is deleted", async () => {
    const user = await createUser("Account cascade user")
    const achievement = await prisma.userAchievement.create({
      data: { userId: user.id, achievementId: "cascade-achievement" },
    })
    const fact = await prisma.userStatisticFact.create({
      data: { userId: user.id, kind: "CASCADE_FACT", reference: "cascade-reference" },
    })

    await prisma.user.delete({ where: { id: user.id } })

    expect(await prisma.userAchievement.count({ where: { id: achievement.id } })).toBe(0)
    expect(await prisma.userStatisticFact.count({ where: { id: fact.id } })).toBe(0)
  })

  it("rejects deleting a user referenced by membership and leaves both rows intact", async () => {
    const [admin, member] = await Promise.all([
      createUser("Restrict delete admin"),
      createUser("Restrict delete member"),
    ])
    const group = await createGroup(admin.id, {
      name: "Restrict user deletion",
      type: "OTHER",
      currency: "RUB",
      memberIds: [member.id],
    })

    await expect(prisma.user.delete({ where: { id: member.id } })).rejects.toMatchObject({
      code: "P2003",
    })
    expect(await prisma.user.count({ where: { id: member.id } })).toBe(1)
    expect(
      await prisma.groupMember.count({ where: { groupId: group.id, userId: member.id } })
    ).toBe(1)
  })

  it("rejects deactivating a member while their projected balance is non-zero", async () => {
    const [admin, member] = await Promise.all([
      createUser("Inactive balance admin"),
      createUser("Inactive balance member"),
    ])
    const group = await createGroup(admin.id, {
      name: "Inactive balance invariant",
      type: "OTHER",
      currency: "RUB",
      memberIds: [member.id],
    })
    await createExpense(group.id, admin.id, {
      title: "Outstanding debt",
      amount: 100,
      currency: "RUB",
      date: operationDate,
      paidById: admin.id,
      splitType: "EXACT",
      splits: [{ userId: member.id, amount: 100 }],
    })

    await expect(prisma.groupMember.update({
      where: { groupId_userId: { groupId: group.id, userId: member.id } },
      data: { isActive: false },
    })).rejects.toBeDefined()
    await expect(prisma.groupMember.findUniqueOrThrow({
      where: { groupId_userId: { groupId: group.id, userId: member.id } },
      select: { isActive: true },
    })).resolves.toEqual({ isActive: true })
  })

  it("rejects new financial rows for an inactive historical member", async () => {
    const [admin, formerMember] = await Promise.all([
      createUser("Inactive operation admin"),
      createUser("Inactive operation member"),
    ])
    const group = await createGroup(admin.id, {
      name: "Inactive operation invariant",
      type: "OTHER",
      currency: "RUB",
      memberIds: [formerMember.id],
    })
    await prisma.groupMember.update({
      where: { groupId_userId: { groupId: group.id, userId: formerMember.id } },
      data: { isActive: false },
    })

    await expect(prisma.expense.create({
      data: {
        groupId: group.id,
        paidById: admin.id,
        createdById: admin.id,
        title: "Inactive split",
        amount: 100,
        amountBase: 100,
        currency: "RUB",
        date: new Date(`${operationDate}T00:00:00.000Z`),
        splits: {
          create: { userId: formerMember.id, amount: 100, amountBase: 100 },
        },
      },
    })).rejects.toBeDefined()
    expect(await prisma.expense.count({
      where: { groupId: group.id, title: "Inactive split" },
    })).toBe(0)
  })

  it("retains membership history required by otherwise settled financial rows", async () => {
    const [admin, member] = await Promise.all([
      createUser("Membership history constraint admin"),
      createUser("Membership history constraint member"),
    ])
    const group = await createGroup(admin.id, {
      name: "Membership history constraint",
      type: "OTHER",
      currency: "RUB",
      memberIds: [member.id],
    })
    await createExpense(group.id, admin.id, {
      title: "Historical membership expense",
      amount: 100,
      currency: "RUB",
      date: operationDate,
      paidById: member.id,
      splitType: "EXACT",
      splits: [{ userId: member.id, amount: 100 }],
    })

    await expect(prisma.groupMember.delete({
      where: { groupId_userId: { groupId: group.id, userId: member.id } },
    })).rejects.toBeDefined()
    expect(await prisma.groupMember.count({
      where: { groupId: group.id, userId: member.id },
    })).toBe(1)
  })
})
