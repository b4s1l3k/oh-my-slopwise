import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import { getUserAchievements } from "@/services/achievements.service"
import { createExpense, deleteExpense, getExpense, updateExpense } from "@/services/expenses.service"
import { createGroup, deleteGroup, getGroup, removeMember } from "@/services/groups.service"
import { acceptInvite, revokeInvite } from "@/services/invites.service"
import {
  getCurrentUserStatistics,
  getHistoricalUserStatistics,
  getHistoricalUserMoneyStatistics,
  getUserStatistics,
} from "@/services/statistics.service"

const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === "true"
const describeDatabase = runDatabaseTests ? describe : describe.skip
const testPrefix = `codex-integration-${Date.now()}`

describeDatabase("achievement persistence and group deletion", () => {
  afterAll(async () => {
    await prisma.group.deleteMany({
      where: { createdBy: { email: { startsWith: testPrefix } } },
    })
    await prisma.user.deleteMany({
      where: { email: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
  })

  it("keeps lifetime statistics and achievement progress after deleting a group", async () => {
    const now = new Date("2026-08-01T12:00:00.000Z")
    const [admin, member] = await Promise.all([
      prisma.user.create({
        data: {
          email: `${testPrefix}-history-admin@example.com`,
          name: "History Admin",
          passwordHash: "test-only",
          createdAt: new Date("2025-01-01T00:00:00.000Z"),
        },
      }),
      prisma.user.create({
        data: {
          email: `${testPrefix}-history-member@example.com`,
          name: "History Member",
          passwordHash: "test-only",
        },
      }),
    ])

    const group = await createGroup(admin.id, {
      name: "Historical trip",
      description: "Must survive as account history",
      type: "TRIP",
      currency: "RUB",
      memberIds: [member.id],
    })
    await createExpense(group.id, admin.id, {
      title: "Dinner",
      amount: 1000,
      currency: "RUB",
      date: now.toISOString(),
      paidById: admin.id,
      splitType: "EQUAL",
      splits: [{ userId: admin.id }, { userId: member.id }],
      cashPayments: [{ userId: member.id, amount: 500 }],
    })

    await deleteGroup(group.id, admin.id)

    const [current, historical, money, achievements] = await Promise.all([
      getCurrentUserStatistics(admin.id, now),
      getHistoricalUserStatistics(admin.id, now),
      getHistoricalUserMoneyStatistics(admin.id),
      getUserAchievements(admin.id, now),
    ])

    expect(current).toMatchObject({
      activeGroups: 0,
      groupsCreated: 0,
      expensesCreated: 0,
      expensesParticipated: 0,
      expensesPaid: 0,
      settlementsReceived: 0,
      currenciesUsed: 0,
    })
    expect(historical).toMatchObject({
      activeGroups: 1,
      groupsCreated: 1,
      expensesCreated: 1,
      expensesParticipated: 1,
      expensesPaid: 1,
      settlementsReceived: 1,
      equalSplits: 1,
      currenciesUsed: 1,
      uniquePeople: 1,
      maxExpenseParticipants: 2,
      maxGroupMembers: 2,
      maxGroupExpenses: 1,
      tripGroups: 1,
    })
    expect(money).toEqual({
      spent: [{ currency: "RUB", amount: 1000 }],
      returned: [{ currency: "RUB", amount: 500 }],
    })
    expect(
      achievements.achievements.find((item) => item.id === "first-group")?.unlocked
    ).toBe(true)
    expect(
      achievements.achievements.find((item) => item.id === "first-expense")?.unlocked
    ).toBe(true)
  })

  it("deletes an expense and its cash settlement without losing lifetime money totals", async () => {
    const now = new Date("2026-08-01T12:00:00.000Z")
    const [admin, member] = await Promise.all([
      prisma.user.create({
        data: {
          email: `${testPrefix}-expense-history-admin@example.com`,
          name: "Expense History Admin",
          passwordHash: "test-only",
        },
      }),
      prisma.user.create({
        data: {
          email: `${testPrefix}-expense-history-member@example.com`,
          name: "Expense History Member",
          passwordHash: "test-only",
        },
      }),
    ])
    const group = await createGroup(admin.id, {
      name: "Expense deletion history",
      type: "OTHER",
      currency: "RUB",
      memberIds: [member.id],
    })
    const expense = await createExpense(group.id, admin.id, {
      title: "Deleted dinner",
      amount: 24_000,
      currency: "RUB",
      date: now.toISOString(),
      paidById: admin.id,
      splitType: "EQUAL",
      splits: [{ userId: admin.id }, { userId: member.id }],
      cashPayments: [{ userId: member.id, amount: 12_000 }],
    })
    const cashSettlementId = (await prisma.settlement.findFirst({
      where: { expenseId: expense.id },
      select: { id: true },
    }))?.id
    expect(cashSettlementId).toBeDefined()

    await deleteExpense(expense.id, admin.id)

    const [expenseRows, splitRows, cashRows, current, moneyAfterExpenseDeletion] = await Promise.all([
      prisma.expense.count({ where: { id: expense.id } }),
      prisma.expenseSplit.count({ where: { expenseId: expense.id } }),
      prisma.settlement.count({ where: { id: cashSettlementId } }),
      getCurrentUserStatistics(admin.id, now),
      getHistoricalUserMoneyStatistics(admin.id),
    ])
    expect({ expenseRows, splitRows, cashRows }).toEqual({
      expenseRows: 0,
      splitRows: 0,
      cashRows: 0,
    })
    expect(current).toMatchObject({
      expensesCreated: 0,
      expensesParticipated: 0,
      expensesPaid: 0,
      settlementsReceived: 0,
    })
    expect(moneyAfterExpenseDeletion).toEqual({
      spent: [{ currency: "RUB", amount: 24_000 }],
      returned: [{ currency: "RUB", amount: 12_000 }],
    })

    // Once the expense is gone there is no outstanding balance, so deleting
    // the group must succeed and must not remove the account-level totals.
    await deleteGroup(group.id, admin.id)
    expect(await prisma.group.count({ where: { id: group.id } })).toBe(0)
    expect(await getHistoricalUserMoneyStatistics(admin.id)).toEqual({
      spent: [{ currency: "RUB", amount: 24_000 }],
      returned: [{ currency: "RUB", amount: 12_000 }],
    })
  })

  it("unlocks and persists the hidden coffee achievement for the expense payer", async () => {
    const user = await prisma.user.create({
      data: {
        email: `${testPrefix}-coffee-payer@example.com`,
        name: "Coffee Payer",
        passwordHash: "test-only",
      },
    })
    const group = await createGroup(user.id, {
      name: "Coffee group",
      type: "OTHER",
      currency: "RUB",
      memberIds: [],
    })
    const expense = await createExpense(group.id, user.id, {
      title: "Капучино с корицей",
      amount: 35_000,
      currency: "RUB",
      date: "2026-08-01T12:00:00.000Z",
      paidById: user.id,
      splitType: "EQUAL",
      splits: [{ userId: user.id }],
    })

    const achievements = await getUserAchievements(user.id)
    expect(
      achievements.achievements.find((item) => item.id === "secret-coffee-path")
    ).toMatchObject({
      title: "Это путь. К кофе",
      unlocked: true,
      hidden: true,
    })
    expect(
      await prisma.userAchievement.count({
        where: { userId: user.id, achievementId: "secret-coffee-path" },
      })
    ).toBe(1)

    await deleteExpense(expense.id, user.id)
    const afterDeletion = await getUserAchievements(user.id)
    expect(
      afterDeletion.achievements.find((item) => item.id === "secret-coffee-path")?.unlocked
    ).toBe(true)

    await deleteGroup(group.id, user.id)
  })

  it("cleans all group-owned rows, recalculates statistics, and preserves earned achievements", async () => {
    const now = new Date("2026-08-01T12:00:00.000Z")
    const [admin, member] = await Promise.all([
      prisma.user.create({
        data: {
          email: `${testPrefix}-admin@example.com`,
          name: "Integration Admin",
          passwordHash: "test-only",
          createdAt: new Date("2025-01-01T00:00:00.000Z"),
        },
      }),
      prisma.user.create({
        data: {
          email: `${testPrefix}-member@example.com`,
          name: "Integration Member",
          passwordHash: "test-only",
        },
      }),
    ])

    const group = await prisma.group.create({
      data: {
        name: "Cascade integration group",
        type: "TRIP",
        currency: "RUB",
        createdById: admin.id,
        members: {
          create: [
            { userId: admin.id, role: "ADMIN" },
            { userId: member.id, role: "MEMBER" },
          ],
        },
        invites: {
          create: {
            token: `${testPrefix}-invite`,
            createdById: admin.id,
          },
        },
      },
    })

    const expense = await prisma.expense.create({
      data: {
        groupId: group.id,
        paidById: admin.id,
        createdById: admin.id,
        title: "Integration expense",
        amount: 20_000,
        amountBase: 20_000,
        splitType: "EQUAL",
        date: now,
        splits: {
          create: [
            { userId: admin.id, amount: 10_000, amountBase: 10_000 },
            { userId: member.id, amount: 10_000, amountBase: 10_000 },
          ],
        },
      },
    })

    const settlement = await prisma.settlement.create({
      data: {
        groupId: group.id,
        fromUserId: member.id,
        toUserId: admin.id,
        amount: 10_000,
        amountBase: 10_000,
        date: now,
      },
    })

    const activity = await prisma.activityLog.create({
      data: {
        groupId: group.id,
        actorId: admin.id,
        type: "EXPENSE_CREATED",
        entityType: "expense",
        entityId: expense.id,
        metadata: { title: expense.title },
      },
    })

    const statisticsBefore = await getUserStatistics(admin.id, now)
    expect(statisticsBefore).toMatchObject({
      activeGroups: 1,
      groupsCreated: 1,
      invitesCreated: 1,
      expensesCreated: 1,
      expensesParticipated: 1,
      expensesPaid: 1,
      settlementsReceived: 1,
      equalSplits: 1,
      currenciesUsed: 1,
      uniquePeople: 1,
      maxGroupMembers: 2,
      maxGroupExpenses: 1,
      tripGroups: 1,
    })

    const achievementsBefore = await getUserAchievements(admin.id, now)
    expect(
      achievementsBefore.achievements.find((item) => item.id === "first-group")?.unlocked
    ).toBe(true)
    expect(
      await prisma.userAchievement.count({
        where: { userId: admin.id, achievementId: "first-group" },
      })
    ).toBe(1)

    await deleteGroup(group.id, admin.id)

    const [
      groups,
      members,
      expenses,
      splits,
      settlements,
      activities,
      invites,
      users,
      achievements,
    ] = await Promise.all([
      prisma.group.count({ where: { id: group.id } }),
      prisma.groupMember.count({ where: { groupId: group.id } }),
      prisma.expense.count({ where: { groupId: group.id } }),
      prisma.expenseSplit.count({ where: { expenseId: expense.id } }),
      prisma.settlement.count({ where: { id: settlement.id } }),
      prisma.activityLog.count({ where: { id: activity.id } }),
      prisma.groupInvite.count({ where: { groupId: group.id } }),
      prisma.user.count({ where: { id: { in: [admin.id, member.id] } } }),
      prisma.userAchievement.count({ where: { userId: admin.id } }),
    ])

    expect({ groups, members, expenses, splits, settlements, activities, invites }).toEqual({
      groups: 0,
      members: 0,
      expenses: 0,
      splits: 0,
      settlements: 0,
      activities: 0,
      invites: 0,
    })
    expect(users).toBe(2)
    expect(achievements).toBeGreaterThan(0)

    const statisticsAfter = await getUserStatistics(admin.id, now)
    expect(statisticsAfter).toMatchObject({
      activeGroups: 0,
      groupsCreated: 0,
      invitesCreated: 0,
      expensesCreated: 0,
      expensesParticipated: 0,
      expensesPaid: 0,
      settlementsReceived: 0,
      equalSplits: 0,
      currenciesUsed: 0,
      uniquePeople: 0,
      maxGroupMembers: 0,
      maxGroupExpenses: 0,
      tripGroups: 0,
    })

    const achievementsAfter = await getUserAchievements(admin.id, now)
    expect(
      achievementsAfter.achievements.find((item) => item.id === "first-group")?.unlocked
    ).toBe(true)
  })

  it("does not partially delete a group that still has balances", async () => {
    const [admin, member] = await Promise.all([
      prisma.user.create({
        data: {
          email: `${testPrefix}-blocked-admin@example.com`,
          name: "Blocked Admin",
          passwordHash: "test-only",
        },
      }),
      prisma.user.create({
        data: {
          email: `${testPrefix}-blocked-member@example.com`,
          name: "Blocked Member",
          passwordHash: "test-only",
        },
      }),
    ])

    const group = await prisma.group.create({
      data: {
        name: "Group with outstanding balance",
        createdById: admin.id,
        members: {
          create: [
            { userId: admin.id, role: "ADMIN" },
            { userId: member.id, role: "MEMBER" },
          ],
        },
        expenses: {
          create: {
            paidById: admin.id,
            createdById: admin.id,
            title: "Unpaid expense",
            amount: 10_000,
            amountBase: 10_000,
            date: new Date("2026-08-01T12:00:00.000Z"),
            splits: {
              create: [{ userId: member.id, amount: 10_000, amountBase: 10_000 }],
            },
          },
        },
      },
      include: { expenses: true },
    })

    await expect(deleteGroup(group.id, admin.id)).rejects.toThrow("GROUP_HAS_BALANCES")

    expect(await prisma.group.count({ where: { id: group.id } })).toBe(1)
    expect(await prisma.expense.count({ where: { groupId: group.id } })).toBe(1)
    expect(await prisma.groupMember.count({ where: { groupId: group.id } })).toBe(2)

    // Test teardown may remove it directly: the database cascade is what this
    // suite verifies and does not apply the application's balance restriction.
    await prisma.group.delete({ where: { id: group.id } })
  })

  it("deletes cash settlements with their expense without touching manual settlements", async () => {
    const [admin, member] = await Promise.all([
      prisma.user.create({
        data: {
          email: `${testPrefix}-expense-admin@example.com`,
          name: "Expense Admin",
          passwordHash: "test-only",
        },
      }),
      prisma.user.create({
        data: {
          email: `${testPrefix}-expense-member@example.com`,
          name: "Expense Member",
          passwordHash: "test-only",
        },
      }),
    ])

    const group = await prisma.group.create({
      data: {
        name: "Expense cascade group",
        createdById: admin.id,
        members: {
          create: [
            { userId: admin.id, role: "ADMIN" },
            { userId: member.id, role: "MEMBER" },
          ],
        },
      },
    })
    const expense = await prisma.expense.create({
      data: {
        groupId: group.id,
        paidById: admin.id,
        createdById: admin.id,
        title: "Cash expense",
        amount: 10_000,
        amountBase: 10_000,
        date: new Date("2026-08-01T12:00:00.000Z"),
        splits: {
          create: [{ userId: member.id, amount: 10_000, amountBase: 10_000 }],
        },
      },
    })
    const [cashSettlement, manualSettlement] = await Promise.all([
      prisma.settlement.create({
        data: {
          groupId: group.id,
          expenseId: expense.id,
          fromUserId: member.id,
          toUserId: admin.id,
          amount: 10_000,
          amountBase: 10_000,
          date: new Date("2026-08-01T12:00:00.000Z"),
        },
      }),
      prisma.settlement.create({
        data: {
          groupId: group.id,
          fromUserId: admin.id,
          toUserId: member.id,
          amount: 1_000,
          amountBase: 1_000,
          date: new Date("2026-08-01T12:00:00.000Z"),
        },
      }),
    ])

    await prisma.expense.delete({ where: { id: expense.id } })

    expect(await prisma.settlement.count({ where: { id: cashSettlement.id } })).toBe(0)
    expect(await prisma.settlement.count({ where: { id: manualSettlement.id } })).toBe(1)

    await prisma.group.delete({ where: { id: group.id } })
  })

  it("blocks inactive members and never restores an old admin role through an invite", async () => {
    const [admin, inactiveMember, formerAdmin] = await Promise.all([
      prisma.user.create({
        data: {
          email: `${testPrefix}-access-admin@example.com`,
          name: "Access Admin",
          passwordHash: "test-only",
          payeeName: "Private Admin",
          bankName: "Private Bank",
          payeeAccount: "private-account",
        },
      }),
      prisma.user.create({
        data: {
          email: `${testPrefix}-access-inactive@example.com`,
          name: "Inactive Member",
          passwordHash: "test-only",
        },
      }),
      prisma.user.create({
        data: {
          email: `${testPrefix}-access-former-admin@example.com`,
          name: "Former Admin",
          passwordHash: "test-only",
        },
      }),
    ])

    const token = `${testPrefix}-access-invite`
    const group = await prisma.group.create({
      data: {
        name: "Access control group",
        currency: "RUB",
        createdById: admin.id,
        members: {
          create: [
            { userId: admin.id, role: "ADMIN" },
            { userId: inactiveMember.id, role: "MEMBER", isActive: false },
            { userId: formerAdmin.id, role: "ADMIN", isActive: false },
          ],
        },
        invites: { create: { token, createdById: admin.id } },
      },
    })
    const expense = await prisma.expense.create({
      data: {
        groupId: group.id,
        paidById: admin.id,
        createdById: inactiveMember.id,
        title: "Private expense",
        amount: 10_000,
        amountBase: 10_000,
        date: new Date("2026-08-01T12:00:00.000Z"),
        splits: { create: [{ userId: admin.id, amount: 10_000, amountBase: 10_000 }] },
      },
    })

    expect(await getExpense(expense.id, inactiveMember.id)).toBeNull()
    await expect(
      updateExpense(expense.id, inactiveMember.id, {
        title: "Forbidden edit",
        amount: 10_000,
        currency: "RUB",
        date: "2026-08-01T12:00:00.000Z",
        paidById: admin.id,
        splitType: "EQUAL",
        splits: [{ userId: admin.id }],
      })
    ).rejects.toThrow("FORBIDDEN")
    await expect(deleteExpense(expense.id, inactiveMember.id)).rejects.toThrow("FORBIDDEN")
    await expect(revokeInvite(group.id, formerAdmin.id)).rejects.toThrow("FORBIDDEN")
    await expect(removeMember(group.id, admin.id, admin.id)).rejects.toThrow("ADMIN_CANNOT_LEAVE")

    await acceptInvite(token, formerAdmin.id)
    expect(
      await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: group.id, userId: formerAdmin.id } },
        select: { isActive: true, role: true },
      })
    ).toEqual({ isActive: true, role: "MEMBER" })

    const visibleGroup = await getGroup(group.id, formerAdmin.id)
    const visibleAdmin = visibleGroup?.members.find((item) => item.userId === admin.id)
    expect(visibleAdmin).toMatchObject({
      payeeName: null,
      bankName: null,
      payeeAccount: null,
      user: { payeeName: null, bankName: null, payeeAccount: null },
    })

    await prisma.expense.create({
      data: {
        groupId: group.id,
        paidById: admin.id,
        createdById: admin.id,
        title: "Debt requiring requisites",
        amount: 5_000,
        amountBase: 5_000,
        date: new Date("2026-08-01T13:00:00.000Z"),
        splits: {
          create: [{ userId: formerAdmin.id, amount: 5_000, amountBase: 5_000 }],
        },
      },
    })
    const groupWithDebt = await getGroup(group.id, formerAdmin.id)
    expect(
      groupWithDebt?.members.find((item) => item.userId === admin.id)?.user.payeeAccount
    ).toBe("private-account")

    await prisma.group.delete({ where: { id: group.id } })
  })

  it("keeps linked cash settlements consistent when an expense is edited", async () => {
    const [admin, member, newPayer] = await Promise.all([
      prisma.user.create({
        data: {
          email: `${testPrefix}-cash-admin@example.com`,
          name: "Cash Admin",
          passwordHash: "test-only",
        },
      }),
      prisma.user.create({
        data: {
          email: `${testPrefix}-cash-member@example.com`,
          name: "Cash Member",
          passwordHash: "test-only",
        },
      }),
      prisma.user.create({
        data: {
          email: `${testPrefix}-cash-payer@example.com`,
          name: "New Payer",
          passwordHash: "test-only",
        },
      }),
    ])
    const group = await prisma.group.create({
      data: {
        name: "Cash edit group",
        currency: "RUB",
        createdById: admin.id,
        members: {
          create: [
            { userId: admin.id, role: "ADMIN" },
            { userId: member.id, role: "MEMBER" },
            { userId: newPayer.id, role: "MEMBER" },
          ],
        },
      },
    })
    const expense = await prisma.expense.create({
      data: {
        groupId: group.id,
        paidById: admin.id,
        createdById: admin.id,
        title: "Cash before edit",
        amount: 12_000,
        amountBase: 12_000,
        date: new Date("2026-08-01T12:00:00.000Z"),
        splits: {
          create: [
            { userId: admin.id, amount: 6_000, amountBase: 6_000 },
            { userId: member.id, amount: 6_000, amountBase: 6_000 },
          ],
        },
      },
    })
    const cash = await prisma.settlement.create({
      data: {
        groupId: group.id,
        expenseId: expense.id,
        fromUserId: member.id,
        toUserId: admin.id,
        amount: 3_000,
        amountBase: 3_000,
        currency: "RUB",
        date: new Date("2026-08-01T12:00:00.000Z"),
      },
    })

    await updateExpense(expense.id, admin.id, {
      title: "Cash after edit",
      amount: 12_000,
      currency: "RUB",
      date: "2026-08-02T12:00:00.000Z",
      paidById: newPayer.id,
      splitType: "EQUAL",
      splits: [{ userId: admin.id }, { userId: member.id }],
    })

    expect(
      await prisma.settlement.findUnique({
        where: { id: cash.id },
        select: { toUserId: true, amountBase: true, currency: true, date: true, notes: true },
      })
    ).toEqual({
      toUserId: newPayer.id,
      amountBase: 3_000,
      currency: "RUB",
      date: new Date("2026-08-02T12:00:00.000Z"),
      notes: "К расходу «Cash after edit»",
    })
    expect(await getHistoricalUserMoneyStatistics(newPayer.id)).toEqual({
      spent: [{ currency: "RUB", amount: 12_000 }],
      returned: [{ currency: "RUB", amount: 3_000 }],
    })

    await expect(
      updateExpense(expense.id, admin.id, {
        title: "Invalid smaller shares",
        amount: 4_000,
        currency: "RUB",
        date: "2026-08-02T12:00:00.000Z",
        paidById: newPayer.id,
        splitType: "EQUAL",
        splits: [{ userId: admin.id }, { userId: member.id }],
      })
    ).rejects.toThrow("CASH_PAYMENT_INVALID")
    expect(await prisma.expense.findUnique({ where: { id: expense.id }, select: { amount: true } })).toEqual({
      amount: 12_000,
    })

    await prisma.group.delete({ where: { id: group.id } })
  })
})
