import { prisma } from "@/lib/db"
import { randomUUID } from "crypto"

async function assertAdmin(groupId: string, userId: string) {
  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  })
  if (!member || member.role !== "ADMIN") throw new Error("FORBIDDEN")
}

// Возвращает активную ссылку поездки (создаёт, если нет)
export async function getOrCreateInvite(groupId: string, userId: string) {
  await assertAdmin(groupId, userId)
  const existing = await prisma.groupInvite.findFirst({
    where: { groupId, revoked: false },
    orderBy: { createdAt: "desc" },
  })
  if (existing) return existing
  return prisma.groupInvite.create({
    data: { token: randomUUID().replace(/-/g, ""), groupId, createdById: userId },
  })
}

// Отзывает активную ссылку (старая перестаёт работать)
export async function revokeInvite(groupId: string, userId: string) {
  await assertAdmin(groupId, userId)
  await prisma.groupInvite.updateMany({
    where: { groupId, revoked: false },
    data: { revoked: true },
  })
}

// Инфо о приглашении по токену (для страницы вступления)
export async function getInviteInfo(token: string) {
  const invite = await prisma.groupInvite.findUnique({
    where: { token },
    include: {
      group: {
        include: { _count: { select: { members: { where: { isActive: true } } } } },
      },
    },
  })
  if (!invite || invite.revoked) return null
  return {
    groupId: invite.groupId,
    groupName: invite.group.name,
    memberCount: invite.group._count.members,
  }
}

// Вступление в поездку по токену
export async function acceptInvite(token: string, userId: string) {
  const invite = await prisma.groupInvite.findUnique({ where: { token } })
  if (!invite || invite.revoked) throw new Error("INVITE_INVALID")

  const existing = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: invite.groupId, userId } },
  })
  // Уже активный участник — ничего не меняем и не засоряем историю
  if (existing?.isActive) return { groupId: invite.groupId }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })

  await prisma.$transaction(async (tx) => {
    await tx.groupMember.upsert({
      where: { groupId_userId: { groupId: invite.groupId, userId } },
      create: { groupId: invite.groupId, userId, role: "MEMBER" },
      update: { isActive: true },
    })
    await tx.activityLog.create({
      data: {
        groupId: invite.groupId,
        actorId: userId,
        type: "MEMBER_ADDED",
        entityType: "member",
        entityId: userId,
        metadata: { memberName: user?.name, viaInvite: true },
      },
    })
  })
  return { groupId: invite.groupId }
}
