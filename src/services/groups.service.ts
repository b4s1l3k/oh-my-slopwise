import { prisma } from "@/lib/db"
import { computeGroupDebts } from "@/services/balances.service"
import type { CreateGroupInput, UpdateGroupInput } from "@/lib/validations/group"

const memberInclude = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      payeeName: true,
      bankName: true,
      payeeAccount: true,
    },
  },
}

export async function getUserGroups(userId: string) {
  const memberships = await prisma.groupMember.findMany({
    where: { userId, isActive: true },
    include: {
      group: {
        include: {
          members: { where: { isActive: true }, include: memberInclude },
          _count: { select: { expenses: true } },
        },
      },
    },
    orderBy: { group: { updatedAt: "desc" } },
  })
  return memberships.map((m) => m.group)
}

export async function getGroup(groupId: string, userId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: { where: { isActive: true }, include: memberInclude },
      _count: { select: { expenses: true } },
    },
  })
  if (!group) return null
  const isMember = group.members.some((m) => m.userId === userId)
  if (!isMember) return null
  return group
}

export async function createGroup(userId: string, data: CreateGroupInput) {
  const memberIds = [...new Set([userId, ...data.memberIds])]
  return prisma.group.create({
    data: {
      name: data.name,
      description: data.description,
      type: data.type,
      currency: data.currency,
      createdById: userId,
      members: {
        create: memberIds.map((id) => ({
          userId: id,
          role: id === userId ? "ADMIN" : "MEMBER",
        })),
      },
    },
    include: { members: { include: memberInclude } },
  })
}

export async function updateGroup(
  groupId: string,
  userId: string,
  data: UpdateGroupInput
) {
  await assertAdmin(groupId, userId)
  return prisma.$transaction(async (tx) => {
    const group = await tx.group.update({
      where: { id: groupId },
      data: { name: data.name, description: data.description },
      include: { members: { include: memberInclude } },
    })
    await tx.activityLog.create({
      data: {
        groupId,
        actorId: userId,
        type: "GROUP_UPDATED",
        entityType: "group",
        entityId: groupId,
        metadata: { name: group.name },
      },
    })
    return group
  })
}

export async function deleteGroup(groupId: string, userId: string) {
  await assertAdmin(groupId, userId)

  // Нельзя удалять группу с незакрытыми долгами
  const { raw } = await computeGroupDebts(groupId)
  if (raw.some((b) => b.balance !== 0)) throw new Error("GROUP_HAS_BALANCES")

  // Явно чистим зависимые записи (expenses/settlements не каскадятся при удалении группы)
  await prisma.$transaction([
    prisma.activityLog.deleteMany({ where: { groupId } }),
    prisma.settlement.deleteMany({ where: { groupId } }),
    prisma.expense.deleteMany({ where: { groupId } }), // splits каскадом
    prisma.group.delete({ where: { id: groupId } }), // members каскадом
  ])
}

export async function addMember(groupId: string, adminId: string, memberId: string) {
  await assertAdmin(groupId, adminId)

  const user = await prisma.user.findUnique({ where: { id: memberId } })
  if (!user) throw new Error("USER_NOT_FOUND")

  return prisma.$transaction(async (tx) => {
    const member = await tx.groupMember.upsert({
      where: { groupId_userId: { groupId, userId: memberId } },
      create: { groupId, userId: memberId, role: "MEMBER" },
      update: { isActive: true },
      include: memberInclude,
    })
    await tx.activityLog.create({
      data: {
        groupId,
        actorId: adminId,
        type: "MEMBER_ADDED",
        entityType: "member",
        entityId: memberId,
        metadata: { memberName: user.name },
      },
    })
    return member
  })
}

export async function removeMember(groupId: string, adminId: string, memberId: string) {
  // выйти может сам участник; удалить другого — только админ
  if (adminId !== memberId) await assertAdmin(groupId, adminId)

  // Нельзя убирать участника с ненулевым балансом
  const { raw } = await computeGroupDebts(groupId)
  const balance = raw.find((b) => b.userId === memberId)?.balance ?? 0
  if (balance !== 0) throw new Error("MEMBER_HAS_BALANCE")

  const user = await prisma.user.findUnique({
    where: { id: memberId },
    select: { name: true },
  })

  return prisma.$transaction(async (tx) => {
    const member = await tx.groupMember.update({
      where: { groupId_userId: { groupId, userId: memberId } },
      data: { isActive: false },
    })
    await tx.activityLog.create({
      data: {
        groupId,
        actorId: adminId,
        type: "MEMBER_REMOVED",
        entityType: "member",
        entityId: memberId,
        // selfLeft — сам вышел; иначе удалён админом
        metadata: { memberName: user?.name, selfLeft: adminId === memberId },
      },
    })
    return member
  })
}

async function assertAdmin(groupId: string, userId: string) {
  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  })
  if (!member || !member.isActive || member.role !== "ADMIN") {
    throw new Error("FORBIDDEN")
  }
}
