import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { getOutstandingDebt } from "@/services/balances.service"
import type { CreateSettlementInput } from "@/lib/validations/settlement"

export async function createSettlement(
  userId: string,
  data: CreateSettlementInput
) {
  if (data.toUserId === userId) throw new Error("SELF_SETTLEMENT")

  const group = await prisma.group.findUnique({
    where: { id: data.groupId },
    include: { members: { where: { isActive: true }, select: { userId: true } } },
  })
  if (!group) throw new Error("NOT_FOUND")

  const memberIds = new Set(group.members.map((m) => m.userId))
  if (!memberIds.has(userId)) throw new Error("FORBIDDEN")
  if (!memberIds.has(data.toUserId)) throw new Error("RECIPIENT_NOT_MEMBER")

  return prisma.$transaction(async (tx) => {
    const txGroup = await tx.group.findUnique({
      where: { id: data.groupId },
      include: { members: { where: { isActive: true }, select: { userId: true } } },
    })
    if (!txGroup) throw new Error("NOT_FOUND")
    const txMemberIds = new Set(txGroup.members.map((member) => member.userId))
    if (!txMemberIds.has(userId)) throw new Error("FORBIDDEN")
    if (!txMemberIds.has(data.toUserId)) throw new Error("RECIPIENT_NOT_MEMBER")

    // Debt check inside the transaction prevents A1 race (two concurrent settlements exceeding debt)
    const outstanding = await getOutstandingDebt(data.groupId, userId, data.toUserId, tx)
    if (outstanding <= 0) throw new Error("NO_DEBT")
    if (data.amount > outstanding) throw new Error("AMOUNT_EXCEEDS_DEBT")

    const settlement = await tx.settlement.create({
      data: {
        groupId: data.groupId,
        fromUserId: userId,
        toUserId: data.toUserId,
        amount: data.amount,
        currency: txGroup.currency, // расчёт всегда в валюте расчёта группы
        amountBase: data.amount, // уже в валюте расчёта
        date: new Date(data.date),
        notes: data.notes,
      },
      include: {
        fromUser: { select: { id: true, name: true, avatarUrl: true } },
        toUser: { select: { id: true, name: true, avatarUrl: true } },
      },
    })

    await tx.activityLog.create({
      data: {
        groupId: data.groupId,
        actorId: userId,
        type: "SETTLEMENT_CREATED",
        entityType: "settlement",
        entityId: settlement.id,
        metadata: { amount: data.amount, currency: txGroup.currency, toUserName: settlement.toUser.name },
      },
    })

    await tx.group.update({ where: { id: data.groupId }, data: { updatedAt: new Date() } })

    return settlement
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

// Сброс зафиксированных расчётов группы (только админ).
// Удаляет только ручные расчёты (expenseId IS NULL).
// Наличные платежи на месте (привязаны к конкретной трате) не затрагивает —
// они считаются частью траты и пересчёт балансов их не отменяет.
export async function resetSettlements(groupId: string, userId: string) {
  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  })
  if (!member?.isActive || member.role !== "ADMIN") throw new Error("FORBIDDEN")

  return prisma.$transaction(async (tx) => {
    const txMember = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    })
    if (!txMember?.isActive || txMember.role !== "ADMIN") throw new Error("FORBIDDEN")

    const { count } = await tx.settlement.deleteMany({ where: { groupId, expenseId: null } })
    if (count > 0) {
      await tx.activityLog.create({
        data: {
          groupId,
          actorId: userId,
          type: "SETTLEMENTS_RESET",
          entityType: "group",
          entityId: groupId,
          metadata: { removed: count },
        },
      })
    }
    if (count > 0) {
      await tx.group.update({ where: { id: groupId }, data: { updatedAt: new Date() } })
    }
    return { removed: count }
  })
}

export async function getGroupSettlements(groupId: string, userId: string) {
  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  })
  if (!member?.isActive) throw new Error("FORBIDDEN")

  return prisma.settlement.findMany({
    where: { groupId },
    include: {
      fromUser: { select: { id: true, name: true, avatarUrl: true } },
      toUser: { select: { id: true, name: true, avatarUrl: true } },
    },
    orderBy: { date: "desc" },
  })
}
