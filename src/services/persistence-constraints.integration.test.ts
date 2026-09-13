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
      where: { currency: { startsWith: "constraint-" } },
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
    const currency = `constraint-${userSequence}`
    await prisma.exchangeRate.create({ data: { date, currency, rate: 12.5 } })
    await expect(
      prisma.exchangeRate.create({ data: { date, currency, rate: 13.5 } })
    ).rejects.toMatchObject({ code: "P2002" })
    expect(
      await prisma.exchangeRate.findUnique({
        where: { date_currency: { date, currency } },
        select: { rate: true },
      })
    ).toEqual({ rate: 12.5 })
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
})
