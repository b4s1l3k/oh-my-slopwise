import { prisma } from "@/lib/db"
import { calculateSplits } from "@/lib/utils/split-calculator"
import type { CreateExpenseInput } from "@/lib/validations/expense"

const splitInclude = {
  user: { select: { id: true, name: true, email: true, avatarUrl: true } },
}

const expenseInclude = {
  paidBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
  createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
  splits: { include: splitInclude },
}

export async function getGroupExpenses(groupId: string, page = 1, perPage = 30) {
  const [expenses, total] = await Promise.all([
    prisma.expense.findMany({
      where: { groupId },
      include: expenseInclude,
      orderBy: { date: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.expense.count({ where: { groupId } }),
  ])
  return { expenses, total, hasNext: total > page * perPage }
}

export async function getExpense(expenseId: string, userId: string) {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: expenseInclude,
  })
  if (!expense) return null
  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: expense.groupId, userId } },
  })
  if (!member) return null
  return expense
}

export async function createExpense(
  groupId: string,
  userId: string,
  data: CreateExpenseInput
) {
  await assertMember(groupId, userId)

  const splitResults = calculateSplits(data.amount, data.splitType, data.splits)

  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        groupId,
        paidById: data.paidById,
        createdById: userId,
        title: data.title,
        amount: data.amount,
        currency: data.currency,
        category: data.category,
        splitType: data.splitType,
        date: new Date(data.date),
        notes: data.notes,
        splits: {
          create: splitResults.map((s, i) => ({
            userId: s.userId,
            amount: s.amount,
            share:
              data.splitType === "SHARES"
                ? (data.splits[i] as { userId: string; shares: number }).shares
                : undefined,
            percentage:
              data.splitType === "PERCENTAGE"
                ? (data.splits[i] as { userId: string; percentage: number }).percentage
                : undefined,
          })),
        },
      },
      include: expenseInclude,
    })

    await tx.activityLog.create({
      data: {
        groupId,
        actorId: userId,
        type: "EXPENSE_CREATED",
        entityType: "expense",
        entityId: expense.id,
        metadata: { title: expense.title, amount: expense.amount },
      },
    })

    await tx.group.update({
      where: { id: groupId },
      data: { updatedAt: new Date() },
    })

    return expense
  })
}

export async function deleteExpense(expenseId: string, userId: string) {
  const expense = await prisma.expense.findUnique({ where: { id: expenseId } })
  if (!expense) throw new Error("NOT_FOUND")

  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: expense.groupId, userId } },
  })
  if (!member) throw new Error("FORBIDDEN")
  if (expense.createdById !== userId && member.role !== "ADMIN") {
    throw new Error("FORBIDDEN")
  }

  await prisma.$transaction([
    prisma.activityLog.create({
      data: {
        groupId: expense.groupId,
        actorId: userId,
        type: "EXPENSE_DELETED",
        entityType: "expense",
        entityId: expense.id,
        metadata: { title: expense.title, amount: expense.amount },
      },
    }),
    prisma.expense.delete({ where: { id: expenseId } }),
  ])
}

async function assertMember(groupId: string, userId: string) {
  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  })
  if (!member || !member.isActive) throw new Error("FORBIDDEN")
}
