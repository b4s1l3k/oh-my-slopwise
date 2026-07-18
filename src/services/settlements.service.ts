import { prisma } from "@/lib/db"
import type { CreateSettlementInput } from "@/lib/validations/settlement"

export async function createSettlement(
  userId: string,
  data: CreateSettlementInput
) {
  if (data.groupId) {
    const member = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: data.groupId, userId } },
    })
    if (!member || !member.isActive) throw new Error("FORBIDDEN")
  }

  return prisma.$transaction(async (tx) => {
    const settlement = await tx.settlement.create({
      data: {
        groupId: data.groupId,
        fromUserId: userId,
        toUserId: data.toUserId,
        amount: data.amount,
        currency: data.currency,
        date: new Date(data.date),
        notes: data.notes,
      },
      include: {
        fromUser: { select: { id: true, name: true, email: true, avatarUrl: true } },
        toUser: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    })

    if (data.groupId) {
      await tx.activityLog.create({
        data: {
          groupId: data.groupId,
          actorId: userId,
          type: "SETTLEMENT_CREATED",
          entityType: "settlement",
          entityId: settlement.id,
          metadata: {
            amount: data.amount,
            toUserName: settlement.toUser.name,
          },
        },
      })
    }

    return settlement
  })
}

export async function getGroupSettlements(groupId: string, userId: string) {
  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  })
  if (!member) throw new Error("FORBIDDEN")

  return prisma.settlement.findMany({
    where: { groupId },
    include: {
      fromUser: { select: { id: true, name: true, email: true, avatarUrl: true } },
      toUser: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
    orderBy: { date: "desc" },
  })
}
