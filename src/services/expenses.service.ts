import { prisma } from "@/lib/db"
import { calculateSplits } from "@/lib/utils/split-calculator"
import { getRateToRub } from "@/services/exchange.service"
import type { CreateExpenseInput } from "@/lib/validations/expense"

const splitInclude = {
  user: { select: { id: true, name: true, email: true, avatarUrl: true } },
}

const expenseInclude = {
  paidBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
  createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
  splits: { include: splitInclude },
  // Расчёты наличными, сделанные в момент этой траты
  settlements: {
    select: {
      id: true,
      amount: true,
      currency: true,
      amountBase: true,
      fromUser: { select: { id: true, name: true } },
    },
  },
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

// Проверяет права + членство плательщика и всех участников, возвращает валюту группы
async function validateExpenseParticipants(
  groupId: string,
  userId: string,
  data: CreateExpenseInput
): Promise<string> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { members: { where: { isActive: true }, select: { userId: true } } },
  })
  if (!group) throw new Error("NOT_FOUND")

  const memberIds = new Set(group.members.map((m) => m.userId))
  if (!memberIds.has(userId)) throw new Error("FORBIDDEN")
  if (!memberIds.has(data.paidById)) throw new Error("PAYER_NOT_MEMBER")
  for (const s of data.splits) {
    if (!memberIds.has(s.userId)) throw new Error("SPLIT_USER_NOT_MEMBER")
  }
  return group.currency
}

// factor — множитель «валюта траты → валюта расчёта» (кросс-курс на дату)
function buildSplitRows(data: CreateExpenseInput, factor: number) {
  const splitResults = calculateSplits(data.amount, data.splitType, data.splits)
  return splitResults.map((s, i) => ({
    userId: s.userId,
    amount: s.amount,
    amountBase: Math.round(s.amount * factor),
    share:
      data.splitType === "SHARES"
        ? (data.splits[i] as { userId: string; shares: number }).shares
        : undefined,
    percentage:
      data.splitType === "PERCENTAGE"
        ? (data.splits[i] as { userId: string; percentage: number }).percentage
        : undefined,
  }))
}

// Множитель пересчёта из валюты траты в валюту расчёта группы на дату
async function conversionFactor(from: string, to: string, date: Date): Promise<number> {
  if (from === to) return 1
  const [rf, rt] = await Promise.all([getRateToRub(from, date), getRateToRub(to, date)])
  return rf / rt
}

// Определяет фактор пересчёта: ручной курс (если задан) или курс ЦБ на дату.
// Возвращает и фактор для расчёта, и customRate для сохранения (null = курс ЦБ).
async function resolveFactor(
  data: CreateExpenseInput,
  settlementCurrency: string
): Promise<{ factor: number; customRate: number | null }> {
  if (data.currency === settlementCurrency) return { factor: 1, customRate: null }
  if (data.customRate != null) return { factor: data.customRate, customRate: data.customRate }
  const factor = await conversionFactor(data.currency, settlementCurrency, new Date(data.date))
  return { factor, customRate: null }
}

export async function createExpense(
  groupId: string,
  userId: string,
  data: CreateExpenseInput
) {
  const settlementCurrency = await validateExpenseParticipants(groupId, userId, data)
  const { factor, customRate } = await resolveFactor(data, settlementCurrency)
  const splitRows = buildSplitRows(data, factor)

  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        groupId,
        paidById: data.paidById,
        createdById: userId,
        title: data.title,
        amount: data.amount,
        currency: data.currency, // валюта конкретной траты
        amountBase: Math.round(data.amount * factor), // в валюте расчёта группы
        customRate, // ручной курс или null (курс ЦБ)
        category: data.category,
        splitType: data.splitType,
        date: new Date(data.date),
        notes: data.notes,
        splits: { create: splitRows },
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
        metadata: { title: expense.title, amount: expense.amount, currency: expense.currency },
      },
    })

    // Создаём расчёты для наличных платежей на месте (атомарно с расходом)
    if (data.cashPayments && data.cashPayments.length > 0) {
      const payer = await tx.user.findUnique({
        where: { id: data.paidById },
        select: { name: true },
      })
      for (const cp of data.cashPayments) {
        const settlement = await tx.settlement.create({
          data: {
            groupId,
            expenseId: expense.id, // связь с тратой — расчёт сделан в её момент
            fromUserId: cp.userId,
            toUserId: data.paidById,
            amount: cp.amount,
            currency: data.currency,
            amountBase: Math.round(cp.amount * factor),
            date: new Date(data.date),
            notes: `К расходу «${data.title}»`,
          },
        })
        await tx.activityLog.create({
          data: {
            groupId,
            actorId: cp.userId,
            type: "SETTLEMENT_CREATED",
            entityType: "settlement",
            entityId: settlement.id,
            metadata: { amount: cp.amount, currency: data.currency, toUserName: payer?.name },
          },
        })
      }
    }

    await tx.group.update({ where: { id: groupId }, data: { updatedAt: new Date() } })
    return expense
  })
}

export async function updateExpense(
  expenseId: string,
  userId: string,
  data: CreateExpenseInput
) {
  const existing = await prisma.expense.findUnique({ where: { id: expenseId } })
  if (!existing) throw new Error("NOT_FOUND")

  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: existing.groupId, userId } },
  })
  if (!member) throw new Error("FORBIDDEN")
  // Редактировать может: автор траты, плательщик или админ поездки
  if (
    existing.createdById !== userId &&
    existing.paidById !== userId &&
    member.role !== "ADMIN"
  ) {
    throw new Error("FORBIDDEN")
  }

  const settlementCurrency = await validateExpenseParticipants(existing.groupId, userId, data)
  const { factor, customRate } = await resolveFactor(data, settlementCurrency)
  const splitRows = buildSplitRows(data, factor)

  // Сводка изменений для истории (что именно поменяли)
  const changes: string[] = []
  if (existing.title !== data.title) changes.push("название")
  if (existing.amount !== data.amount) changes.push("сумма")
  if (existing.currency !== data.currency) changes.push("валюта")
  if (existing.splitType !== data.splitType) changes.push("способ разбивки")
  if (existing.paidById !== data.paidById) changes.push("плательщик")
  if (existing.date.getTime() !== new Date(data.date).getTime()) changes.push("дата")
  if ((existing.customRate ?? null) !== (customRate ?? null)) changes.push("курс")

  return prisma.$transaction(async (tx) => {
    // полностью пересобираем split-строки
    await tx.expenseSplit.deleteMany({ where: { expenseId } })
    const expense = await tx.expense.update({
      where: { id: expenseId },
      data: {
        paidById: data.paidById,
        title: data.title,
        amount: data.amount,
        currency: data.currency,
        amountBase: Math.round(data.amount * factor),
        customRate,
        category: data.category,
        splitType: data.splitType,
        date: new Date(data.date),
        notes: data.notes,
        splits: { create: splitRows },
      },
      include: expenseInclude,
    })

    await tx.activityLog.create({
      data: {
        groupId: existing.groupId,
        actorId: userId,
        type: "EXPENSE_UPDATED",
        entityType: "expense",
        entityId: expense.id,
        metadata: {
          title: expense.title,
          amount: expense.amount,
          currency: expense.currency,
          changes,
        },
      },
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
        metadata: { title: expense.title, amount: expense.amount, currency: expense.currency },
      },
    }),
    prisma.expense.delete({ where: { id: expenseId } }),
  ])
}
