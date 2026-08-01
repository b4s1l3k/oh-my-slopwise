import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { calculateSplits } from "@/lib/utils/split-calculator"
import { getRateToRub } from "@/services/exchange.service"
import type { CreateExpenseInput } from "@/lib/validations/expense"
import {
  recordExpenseHistory,
  recordSettlementHistory,
} from "@/services/statistics-history.service"

const splitInclude = {
  user: { select: { id: true, name: true, avatarUrl: true } },
}

const expenseInclude = {
  paidBy: { select: { id: true, name: true, avatarUrl: true } },
  createdBy: { select: { id: true, name: true, avatarUrl: true } },
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

const MAX_DATABASE_INT = 2_147_483_647

export async function getGroupExpenses(groupId: string, userId: string, page = 1, perPage = 30) {
  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  })
  if (!member?.isActive) throw new Error("FORBIDDEN")

  const [expenses, total] = await Promise.all([
    prisma.expense.findMany({
      where: { groupId },
      include: expenseInclude,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }],
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
  if (!member?.isActive) return null
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
  for (const cp of data.cashPayments ?? []) {
    if (!memberIds.has(cp.userId)) throw new Error("SPLIT_USER_NOT_MEMBER")
  }
  return group.currency
}

// factor — множитель «валюта траты → валюта расчёта» (кросс-курс на дату)
function buildSplitRows(data: CreateExpenseInput, factor: number) {
  const splitResults = calculateSplits(data.amount, data.splitType, data.splits)
  assertCashPayments(data, splitResults)
  return splitResults.map((s, i) => {
    const amountBase = toDatabaseInt(s.amount * factor)
    return {
      userId: s.userId,
      amount: s.amount,
      amountBase,
      percentage:
        data.splitType === "PERCENTAGE"
          ? (data.splits[i] as { userId: string; percentage: number }).percentage
          : undefined,
    }
  })
}

function toDatabaseInt(value: number) {
  const rounded = Math.round(value)
  if (!Number.isSafeInteger(rounded) || rounded < 0 || rounded > MAX_DATABASE_INT) {
    throw new Error("CONVERTED_AMOUNT_TOO_LARGE")
  }
  return rounded
}

function assertCashPayments(
  data: CreateExpenseInput,
  splitResults: Array<{ userId: string; amount: number }>
) {
  const splitAmounts = new Map(splitResults.map((split) => [split.userId, split.amount]))
  const paidByUser = new Set<string>()

  for (const payment of data.cashPayments ?? []) {
    const share = splitAmounts.get(payment.userId)
    if (
      payment.userId === data.paidById ||
      paidByUser.has(payment.userId) ||
      share == null ||
      payment.amount > share
    ) {
      throw new Error("CASH_PAYMENT_INVALID")
    }
    paidByUser.add(payment.userId)
  }
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
    // Re-validate membership inside the transaction (A4 race guard)
    const txGroup = await tx.group.findUnique({
      where: { id: groupId },
      include: { members: { where: { isActive: true }, select: { userId: true } } },
    })
    if (!txGroup) throw new Error("NOT_FOUND")
    const txIds = new Set(txGroup.members.map((m) => m.userId))
    if (!txIds.has(userId)) throw new Error("FORBIDDEN")
    if (!txIds.has(data.paidById)) throw new Error("PAYER_NOT_MEMBER")
    for (const s of data.splits) if (!txIds.has(s.userId)) throw new Error("SPLIT_USER_NOT_MEMBER")
    for (const cp of data.cashPayments ?? []) if (!txIds.has(cp.userId)) throw new Error("SPLIT_USER_NOT_MEMBER")

    const expense = await tx.expense.create({
      data: {
        groupId,
        paidById: data.paidById,
        createdById: userId,
        title: data.title,
        amount: data.amount,
        currency: data.currency, // валюта конкретной траты
        amountBase: toDatabaseInt(data.amount * factor), // в валюте расчёта группы
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
        const cashUserName = expense.splits.find((split) => split.userId === cp.userId)?.user.name
        const settlement = await tx.settlement.create({
          data: {
            groupId,
            expenseId: expense.id, // связь с тратой — расчёт сделан в её момент
            fromUserId: cp.userId,
            toUserId: data.paidById,
            amount: cp.amount,
            currency: data.currency,
            amountBase: toDatabaseInt(cp.amount * factor),
            date: new Date(data.date),
            notes: `К расходу «${data.title}»`,
          },
        })
        await tx.activityLog.create({
          data: {
            groupId,
            // actorId is always the authenticated recorder. The participant
            // who handed over cash is kept separately in metadata.
            actorId: userId,
            type: "SETTLEMENT_CREATED",
            entityType: "settlement",
            entityId: settlement.id,
            metadata: {
              amount: cp.amount,
              currency: data.currency,
              toUserName: payer?.name,
              cashFromUserName: cashUserName,
            },
          },
        })
        await recordSettlementHistory(tx, settlement)
      }
    }

    await recordExpenseHistory(tx, {
      id: expense.id,
      groupId: expense.groupId,
      createdById: expense.createdById,
      paidById: expense.paidById,
      currency: expense.currency,
      amount: expense.amount,
      title: expense.title,
      category: expense.category,
      splitType: expense.splitType,
      customRate: expense.customRate,
      participantIds: expense.splits.map((split) => split.userId),
    })

    await tx.group.update({ where: { id: groupId }, data: { updatedAt: new Date() } })
    return expense
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
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
  if (!member?.isActive) throw new Error("FORBIDDEN")
  // Редактировать может: автор траты, плательщик или админ поездки
  if (
    existing.createdById !== userId &&
    existing.paidById !== userId &&
    member.role !== "ADMIN"
  ) {
    throw new Error("FORBIDDEN")
  }

  const settlementCurrency = await validateExpenseParticipants(existing.groupId, userId, data)
  if (data.cashPayments?.length) throw new Error("CASH_PAYMENTS_CREATE_ONLY")
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
    // Re-validate membership inside the transaction (A4 race guard)
    const txGroup = await tx.group.findUnique({
      where: { id: existing.groupId },
      include: {
        members: {
          where: { isActive: true },
          select: { userId: true, role: true },
        },
      },
    })
    if (!txGroup) throw new Error("NOT_FOUND")
    const txIds = new Set(txGroup.members.map((m) => m.userId))
    const txMember = txGroup.members.find((groupMember) => groupMember.userId === userId)
    if (!txMember) throw new Error("FORBIDDEN")

    const txExisting = await tx.expense.findUnique({
      where: { id: expenseId },
      include: {
        settlements: {
          select: { id: true, fromUserId: true, amount: true },
        },
      },
    })
    if (!txExisting || txExisting.groupId !== existing.groupId) throw new Error("NOT_FOUND")
    if (
      txExisting.createdById !== userId &&
      txExisting.paidById !== userId &&
      txMember.role !== "ADMIN"
    ) {
      throw new Error("FORBIDDEN")
    }
    if (!txIds.has(data.paidById)) throw new Error("PAYER_NOT_MEMBER")
    for (const s of data.splits) if (!txIds.has(s.userId)) throw new Error("SPLIT_USER_NOT_MEMBER")

    const splitAmounts = new Map(splitRows.map((split) => [split.userId, split.amount]))
    const cashByUser = new Map<string, number>()
    for (const settlement of txExisting.settlements) {
      cashByUser.set(
        settlement.fromUserId,
        (cashByUser.get(settlement.fromUserId) ?? 0) + settlement.amount
      )
    }
    for (const [cashUserId, cashAmount] of cashByUser) {
      const share = splitAmounts.get(cashUserId)
      if (cashUserId === data.paidById || share == null || cashAmount > share) {
        throw new Error("CASH_PAYMENT_INVALID")
      }
    }

    // Наличные являются частью расхода: при исправлении плательщика, валюты,
    // курса или даты связанные расчёты должны измениться вместе с ним.
    for (const settlement of txExisting.settlements) {
      const updatedSettlement = await tx.settlement.update({
        where: { id: settlement.id },
        data: {
          toUserId: data.paidById,
          currency: data.currency,
          amountBase: toDatabaseInt(settlement.amount * factor),
          date: new Date(data.date),
          notes: `К расходу «${data.title}»`,
        },
      })
      await recordSettlementHistory(tx, updatedSettlement)
    }

    // полностью пересобираем split-строки
    await tx.expenseSplit.deleteMany({ where: { expenseId } })
    const expense = await tx.expense.update({
      where: { id: expenseId },
      data: {
        paidById: data.paidById,
        title: data.title,
        amount: data.amount,
        currency: data.currency,
        amountBase: toDatabaseInt(data.amount * factor),
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
    await recordExpenseHistory(tx, {
      id: expense.id,
      groupId: expense.groupId,
      createdById: expense.createdById,
      paidById: expense.paidById,
      currency: expense.currency,
      amount: expense.amount,
      title: expense.title,
      category: expense.category,
      splitType: expense.splitType,
      customRate: expense.customRate,
      participantIds: expense.splits.map((split) => split.userId),
    })
    await tx.group.update({ where: { id: existing.groupId }, data: { updatedAt: new Date() } })
    return expense
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function deleteExpense(expenseId: string, userId: string) {
  await prisma.$transaction(async (tx) => {
    const expense = await tx.expense.findUnique({ where: { id: expenseId } })
    if (!expense) throw new Error("NOT_FOUND")

    const member = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId: expense.groupId, userId } },
    })
    if (!member?.isActive) throw new Error("FORBIDDEN")
    if (expense.createdById !== userId && member.role !== "ADMIN") {
      throw new Error("FORBIDDEN")
    }

    await tx.activityLog.create({
      data: {
        groupId: expense.groupId,
        actorId: userId,
        type: "EXPENSE_DELETED",
        entityType: "expense",
        entityId: expense.id,
        metadata: { title: expense.title, amount: expense.amount, currency: expense.currency },
      },
    })
    await tx.expense.delete({ where: { id: expenseId } })
    await tx.group.update({ where: { id: expense.groupId }, data: { updatedAt: new Date() } })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}
