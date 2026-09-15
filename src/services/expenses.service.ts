import { prisma } from "@/lib/db"
import { calculateSplits } from "@/lib/utils/split-calculator"
import { parseCalendarDate } from "@/lib/utils/calendar-date"
import { runSerializableTransaction } from "@/lib/serializable-transaction"
import { lockGroupInvariants } from "@/lib/group-invariant-lock"
import { getRateToRub } from "@/services/exchange.service"
import { assertNoInactiveMemberBalances } from "@/services/balances.service"
import type { CreateExpenseInput } from "@/lib/validations/expense"
import { decodeDateCursor, encodeDateCursor } from "@/lib/date-cursor"
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
const EXPENSE_PAGE_SIZE = 30

function decimalToNumber(value: { toNumber(): number } | number | null): number | null {
  if (value === null || typeof value === "number") return value
  return value.toNumber()
}

export async function getGroupExpenses(
  groupId: string,
  userId: string,
  cursor?: string | null,
  pageSize = EXPENSE_PAGE_SIZE
) {
  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  })
  if (!member?.isActive) throw new Error("FORBIDDEN")
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error("INVALID_PAGE_SIZE")
  }

  const decodedCursor = cursor == null ? null : decodeDateCursor(cursor)
  const cursorFilter = decodedCursor
    ? {
        OR: [
          { date: { lt: decodedCursor.date } },
          { date: decodedCursor.date, createdAt: { lt: decodedCursor.createdAt } },
          {
            date: decodedCursor.date,
            createdAt: decodedCursor.createdAt,
            id: { lt: decodedCursor.id },
          },
        ],
      }
    : {}

  const rows = await prisma.expense.findMany({
    where: { groupId, ...cursorFilter },
    include: expenseInclude,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
  })
  const expenses = rows.slice(0, pageSize)
  const lastExpense = expenses.at(-1)
  return {
    expenses,
    nextCursor: rows.length > pageSize && lastExpense
      ? encodeDateCursor(lastExpense)
      : null,
  }
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
function buildExpenseAmounts(data: CreateExpenseInput, factor: number) {
  const splitResults = calculateSplits(data.amount, data.splitType, data.splits)
  if (splitResults.some((split) => split.amount <= 0)) {
    throw new Error("CONVERTED_AMOUNT_TOO_SMALL")
  }
  assertCashPayments(data, splitResults)
  const amountBase = toPositiveDatabaseInt(data.amount * factor)
  const convertedSplits = splitResults.map((split, index) => {
    const exactAmountBase = split.amount * factor
    toDatabaseInt(exactAmountBase)
    const floorAmountBase = Math.floor(exactAmountBase)
    return {
      index,
      floorAmountBase,
      fraction: exactAmountBase - floorAmountBase,
    }
  })
  const allocatedAmountsBase = convertedSplits.map((split) => split.floorAmountBase)
  const floorTotal = allocatedAmountsBase.reduce((sum, value) => sum + value, 0)
  const remainder = amountBase - floorTotal
  if (remainder < 0 || remainder > convertedSplits.length) {
    throw new Error("SPLIT_TOTAL_MISMATCH")
  }
  const allocationOrder = [...convertedSplits].sort(
    (left, right) => right.fraction - left.fraction || left.index - right.index
  )
  for (let i = 0; i < remainder; i++) {
    allocatedAmountsBase[allocationOrder[i].index] += 1
  }
  if (splitResults.some((split, index) => split.amount > 0 && allocatedAmountsBase[index] === 0)) {
    throw new Error("CONVERTED_AMOUNT_TOO_SMALL")
  }

  const splitRows = splitResults.map((split, index) => {
    return {
      userId: split.userId,
      amount: split.amount,
      amountBase: allocatedAmountsBase[index],
      percentage:
        data.splitType === "PERCENTAGE"
          ? (data.splits[index] as { userId: string; percentage: number }).percentage
          : undefined,
    }
  })
  return { amountBase, splitRows }
}

function toDatabaseInt(value: number) {
  const rounded = Math.round(value)
  if (!Number.isSafeInteger(rounded) || rounded < 0 || rounded > MAX_DATABASE_INT) {
    throw new Error("CONVERTED_AMOUNT_TOO_LARGE")
  }
  return rounded
}

function toPositiveDatabaseInt(value: number) {
  const rounded = toDatabaseInt(value)
  if (rounded === 0) throw new Error("CONVERTED_AMOUNT_TOO_SMALL")
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
  settlementCurrency: string,
  expenseDate: Date
): Promise<{ factor: number; customRate: number | null }> {
  if (data.currency === settlementCurrency) return { factor: 1, customRate: null }
  if (data.customRate != null) return { factor: data.customRate, customRate: data.customRate }
  const factor = await conversionFactor(data.currency, settlementCurrency, expenseDate)
  return { factor, customRate: null }
}

export async function createExpense(
  groupId: string,
  userId: string,
  data: CreateExpenseInput
) {
  const settlementCurrency = await validateExpenseParticipants(groupId, userId, data)
  const expenseDate = parseCalendarDate(data.date)
  const { factor, customRate } = await resolveFactor(data, settlementCurrency, expenseDate)
  const { amountBase, splitRows } = buildExpenseAmounts(data, factor)

  return runSerializableTransaction(async (tx) => {
    await lockGroupInvariants(tx, groupId)
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
        amountBase, // в валюте расчёта группы
        customRate, // ручной курс или null (курс ЦБ)
        category: data.category,
        splitType: data.splitType,
        date: expenseDate,
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
        const cashSplit = expense.splits.find((split) => split.userId === cp.userId)
        if (!cashSplit) throw new Error("CASH_PAYMENT_INVALID")
        const cashUserName = cashSplit.user.name
        const splitAmountBase = cashSplit.amountBase ?? cashSplit.amount
        // A full cash payment must clear exactly the already reconciled split.
        // Converting it independently can round to a different minor unit when
        // the expense remainder was allocated between several participants.
        const cashAmountBase = cp.amount === cashSplit.amount
          ? splitAmountBase
          : toPositiveDatabaseInt(cp.amount * factor)
        if (cashAmountBase > splitAmountBase) throw new Error("CASH_PAYMENT_INVALID")
        const settlement = await tx.settlement.create({
          data: {
            groupId,
            expenseId: expense.id, // связь с тратой — расчёт сделан в её момент
            fromUserId: cp.userId,
            toUserId: data.paidById,
            amount: cp.amount,
            currency: data.currency,
            amountBase: cashAmountBase,
            date: expenseDate,
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
      customRate: decimalToNumber(expense.customRate),
      participantIds: expense.splits.map((split) => split.userId),
    })

    await tx.group.update({ where: { id: groupId }, data: { updatedAt: new Date() } })
    // Cash settlements are created after the expense itself, so return a fresh
    // aggregate from the same transaction instead of the pre-settlement snapshot.
    return tx.expense.findUniqueOrThrow({
      where: { id: expense.id },
      include: expenseInclude,
    })
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
  const expenseDate = parseCalendarDate(data.date)
  const { factor, customRate } = await resolveFactor(data, settlementCurrency, expenseDate)
  const { amountBase, splitRows } = buildExpenseAmounts(data, factor)

  // Сводка изменений для истории (что именно поменяли)
  const changes: string[] = []
  if (existing.title !== data.title) changes.push("название")
  if (existing.amount !== data.amount) changes.push("сумма")
  if (existing.currency !== data.currency) changes.push("валюта")
  if (existing.splitType !== data.splitType) changes.push("способ разбивки")
  if (existing.paidById !== data.paidById) changes.push("плательщик")
  if (existing.date.getTime() !== expenseDate.getTime()) changes.push("дата")
  if (decimalToNumber(existing.customRate) !== customRate) changes.push("курс")

  return runSerializableTransaction(async (tx) => {
    await lockGroupInvariants(tx, existing.groupId)
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
          select: { id: true, fromUserId: true, amount: true, amountBase: true },
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

    const splitAmountsBase = new Map(
      splitRows.map((split) => [split.userId, split.amountBase])
    )
    const cashByUserBase = new Map<string, number>()
    for (const settlement of txExisting.settlements) {
      cashByUserBase.set(
        settlement.fromUserId,
        (cashByUserBase.get(settlement.fromUserId) ?? 0) +
          (settlement.amountBase ?? settlement.amount)
      )
    }
    for (const [cashUserId, cashAmountBase] of cashByUserBase) {
      const shareBase = splitAmountsBase.get(cashUserId)
      if (cashUserId === data.paidById || shareBase == null || cashAmountBase > shareBase) {
        throw new Error("CASH_PAYMENT_INVALID")
      }
    }

    // Связанный наличный расчёт хранит деньги, которые действительно передали.
    // При исправлении расхода меняются его получатель и описательные поля, но не
    // исходные amount/currency/amountBase расчёта.
    for (const settlement of txExisting.settlements) {
      const updatedSettlement = await tx.settlement.update({
        where: { id: settlement.id },
        data: {
          toUserId: data.paidById,
          date: expenseDate,
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
        amountBase,
        customRate,
        category: data.category,
        splitType: data.splitType,
        date: expenseDate,
        notes: data.notes,
        splits: { create: splitRows },
      },
      include: expenseInclude,
    })

    await assertNoInactiveMemberBalances(existing.groupId, tx)

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
      customRate: decimalToNumber(expense.customRate),
      participantIds: expense.splits.map((split) => split.userId),
    })
    await tx.group.update({ where: { id: existing.groupId }, data: { updatedAt: new Date() } })
    return expense
  })
}

export async function deleteExpense(expenseId: string, userId: string) {
  const existing = await prisma.expense.findUnique({
    where: { id: expenseId },
    select: { groupId: true },
  })
  if (!existing) throw new Error("NOT_FOUND")

  await runSerializableTransaction(async (tx) => {
    await lockGroupInvariants(tx, existing.groupId)
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
    await assertNoInactiveMemberBalances(expense.groupId, tx)
    await tx.group.update({ where: { id: expense.groupId }, data: { updatedAt: new Date() } })
  })
}
