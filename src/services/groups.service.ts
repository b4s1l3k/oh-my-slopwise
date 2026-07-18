import { prisma } from "@/lib/db"
import type { CreateGroupInput, UpdateGroupInput } from "@/lib/validations/group"

const memberInclude = {
  user: { select: { id: true, name: true, email: true, avatarUrl: true } },
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
    include: {
      members: { include: memberInclude },
    },
  })
}

export async function updateGroup(
  groupId: string,
  userId: string,
  data: UpdateGroupInput
) {
  await assertAdmin(groupId, userId)
  return prisma.group.update({
    where: { id: groupId },
    data: { name: data.name, description: data.description },
    include: { members: { include: memberInclude } },
  })
}

export async function deleteGroup(groupId: string, userId: string) {
  await assertAdmin(groupId, userId)
  return prisma.group.delete({ where: { id: groupId } })
}

export async function addMember(groupId: string, adminId: string, memberId: string) {
  await assertAdmin(groupId, adminId)
  return prisma.groupMember.upsert({
    where: { groupId_userId: { groupId, userId: memberId } },
    create: { groupId, userId: memberId, role: "MEMBER" },
    update: { isActive: true },
    include: memberInclude,
  })
}

export async function removeMember(groupId: string, adminId: string, memberId: string) {
  if (adminId !== memberId) await assertAdmin(groupId, adminId)
  return prisma.groupMember.update({
    where: { groupId_userId: { groupId, userId: memberId } },
    data: { isActive: false },
  })
}

async function assertAdmin(groupId: string, userId: string) {
  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  })
  if (!member || member.role !== "ADMIN") {
    throw new Error("FORBIDDEN")
  }
}
