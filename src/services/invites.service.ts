import { prisma } from "@/lib/db"
import { randomUUID } from "crypto"

async function assertMember(groupId: string, userId: string) {
  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  })
  if (!member?.isActive) throw new Error("FORBIDDEN")
}

async function assertAdmin(groupId: string, userId: string) {
  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  })
  if (!member?.isActive || member.role !== "ADMIN") throw new Error("FORBIDDEN")
}

// Возвращает активную ссылку группы (создаёт, если нет) — доступно всем участникам
export async function getOrCreateInvite(groupId: string, userId: string) {
  await assertMember(groupId, userId)
  return prisma.$transaction(async (tx) => {
    const member = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    })
    if (!member?.isActive) throw new Error("FORBIDDEN")

    const existing = await tx.groupInvite.findFirst({
      where: { groupId, revoked: false },
      orderBy: { createdAt: "desc" },
    })
    if (existing) return existing
    return tx.groupInvite.create({
      data: { token: randomUUID().replace(/-/g, ""), groupId, createdById: userId },
    })
  })
}

// Отзывает активную ссылку (старая перестаёт работать)
export async function revokeInvite(groupId: string, userId: string) {
  await assertAdmin(groupId, userId)
  await prisma.$transaction(async (tx) => {
    const member = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    })
    if (!member?.isActive || member.role !== "ADMIN") throw new Error("FORBIDDEN")

    await tx.groupInvite.updateMany({
      where: { groupId, revoked: false },
      data: { revoked: true },
    })
  })
}

// Инфо о приглашении по токену (для страницы вступления)
export async function getInviteInfo(token: string, userId: string) {
  const invite = await prisma.groupInvite.findUnique({
    where: { token },
    include: {
      group: {
        include: { _count: { select: { members: { where: { isActive: true } } } } },
      },
    },
  })
  if (!invite || invite.revoked) return null
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: invite.groupId, userId } },
  })
  return {
    groupId: invite.groupId,
    groupName: invite.group.name,
    memberCount: invite.group._count.members,
    isAlreadyMember: membership?.isActive === true,
  }
}

// Вступление в группу по токену
export async function acceptInvite(token: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const invite = await tx.groupInvite.findUnique({ where: { token } })
    if (!invite || invite.revoked) throw new Error("INVITE_INVALID")

    const existing = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId: invite.groupId, userId } },
    })
    // Уже активный участник — ничего не меняем и не засоряем историю
    if (existing?.isActive) return { groupId: invite.groupId }

    const user = await tx.user.findUnique({ where: { id: userId }, select: { name: true } })

    await tx.groupMember.upsert({
      where: { groupId_userId: { groupId: invite.groupId, userId } },
      create: { groupId: invite.groupId, userId, role: "MEMBER" },
      // Повторное вступление никогда не должно возвращать старые привилегии.
      update: { isActive: true, role: "MEMBER" },
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
    await tx.group.update({ where: { id: invite.groupId }, data: { updatedAt: new Date() } })
    return { groupId: invite.groupId }
  })
}
