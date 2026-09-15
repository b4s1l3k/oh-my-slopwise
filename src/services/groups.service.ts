import { prisma } from "@/lib/db"
import { computeGroupDebts } from "@/services/balances.service"
import { runSerializableTransaction } from "@/lib/serializable-transaction"
import { lockGroupInvariants } from "@/lib/group-invariant-lock"
import {
  recordGroupCreated,
  recordGroupMemberJoined,
} from "@/services/statistics-history.service"
import type { CreateGroupInput, UpdateGroupInput } from "@/lib/validations/group"
import { MAX_GROUP_MEMBERS } from "@/lib/domain-limits"
import { decodeInstantCursor, encodeInstantCursor } from "@/lib/instant-cursor"
import { runIdempotentCommand } from "@/lib/idempotent-command"

const GROUP_PAGE_SIZE = 30

const memberSelect = {
  id: true,
  groupId: true,
  userId: true,
  role: true,
  joinedAt: true,
  isActive: true,
  user: {
    select: {
      id: true,
      name: true,
      avatarUrl: true,
    },
  },
} as const

const memberWithRequisitesSelect = {
  ...memberSelect,
  payeeName: true,
  bankName: true,
  payeeAccount: true,
  user: {
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      payeeName: true,
      bankName: true,
      payeeAccount: true,
    },
  },
} as const

export async function getUserGroups(
  userId: string,
  cursor?: string | null,
  pageSize = GROUP_PAGE_SIZE
) {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error("INVALID_PAGE_SIZE")
  }
  const decodedCursor = cursor == null ? null : decodeInstantCursor(cursor)
  const membershipCursorFilter = decodedCursor
    ? {
        OR: [
          { groupUpdatedAt: { lt: decodedCursor.updatedAt } },
          {
            groupUpdatedAt: decodedCursor.updatedAt,
            groupId: { lt: decodedCursor.id },
          },
        ],
      }
    : {}

  const rows = await prisma.groupMember.findMany({
    where: {
      userId,
      isActive: true,
      ...membershipCursorFilter,
    },
    include: {
      group: {
        include: {
          members: { where: { isActive: true }, select: memberSelect },
          _count: { select: { expenses: true } },
        },
      },
    },
    orderBy: [
      { groupUpdatedAt: "desc" },
      { groupId: "desc" },
    ],
    take: pageSize + 1,
  })
  const pageRows = rows.slice(0, pageSize)
  const groups = pageRows.map((membership) => membership.group)
  const lastMembership = pageRows.at(-1)
  return {
    groups,
    nextCursor: rows.length > pageSize && lastMembership
      ? encodeInstantCursor({
          updatedAt: lastMembership.groupUpdatedAt,
          id: lastMembership.groupId,
        })
      : null,
  }
}

export async function getGroup(groupId: string, userId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: { where: { isActive: true }, select: memberWithRequisitesSelect },
      _count: { select: { expenses: true } },
    },
  })
  if (!group) return null
  const isMember = group.members.some((m) => m.userId === userId)
  if (!isMember) return null

  const { simplified } = await computeGroupDebts(groupId)
  const visibleRequisites = new Set([
    userId,
    ...simplified
      .filter((debt) => debt.fromUserId === userId)
      .map((debt) => debt.toUserId),
  ])

  return {
    ...group,
    members: group.members.map((member) => {
      if (visibleRequisites.has(member.userId)) return member
      return {
        ...member,
        payeeName: null,
        bankName: null,
        payeeAccount: null,
        user: {
          ...member.user,
          payeeName: null,
          bankName: null,
          payeeAccount: null,
        },
      }
    }),
  }
}

export async function createGroup(
  userId: string,
  data: CreateGroupInput,
  idempotencyKey?: string
) {
  return runIdempotentCommand({
    principalId: userId,
    operation: "CREATE_GROUP",
    key: idempotencyKey,
    request: data,
    prepare: async () => {
      const memberIds = [...new Set([userId, ...data.memberIds])]
      if (memberIds.length > MAX_GROUP_MEMBERS) throw new Error("GROUP_MEMBER_LIMIT")
      const existingUsers = await prisma.user.count({ where: { id: { in: memberIds } } })
      if (existingUsers !== memberIds.length) throw new Error("USER_NOT_FOUND")
      return memberIds
    },
    execute: async (tx, memberIds) => {
      const group = await tx.group.create({
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
        include: { members: { select: memberSelect } },
      })
      await recordGroupCreated(tx, group, memberIds)
      return { result: group, resourceId: group.id }
    },
    load: (tx, resourceId) =>
      tx.group.findUnique({
        where: { id: resourceId },
        include: { members: { select: memberSelect } },
      }),
  })
}

export async function updateGroup(
  groupId: string,
  userId: string,
  data: UpdateGroupInput
) {
  await assertAdmin(groupId, userId)
  return runSerializableTransaction(async (tx) => {
    await lockGroupInvariants(tx, groupId)
    const admin = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    })
    if (!admin?.isActive || admin.role !== "ADMIN") throw new Error("FORBIDDEN")

    const group = await tx.group.update({
      where: { id: groupId },
      data: { name: data.name, description: data.description },
      include: { members: { where: { isActive: true }, select: memberSelect } },
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

  await runSerializableTransaction(async (tx) => {
    await lockGroupInvariants(tx, groupId)
    const admin = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    })
    if (!admin?.isActive || admin.role !== "ADMIN") throw new Error("FORBIDDEN")

    // Balance check inside the transaction prevents A3 race
    const { raw } = await computeGroupDebts(groupId, tx)
    if (raw.some((b) => b.balance !== 0)) throw new Error("GROUP_HAS_BALANCES")

    // Group-owned rows are removed by database cascades. Keeping the cleanup in
    // foreign keys also protects direct/admin deletes outside this service.
    await tx.group.delete({ where: { id: groupId } })
  })
}

export async function addMember(groupId: string, adminId: string, memberId: string) {
  await assertAdmin(groupId, adminId)
  if (adminId === memberId) throw new Error("MEMBER_ALREADY_ACTIVE")

  const user = await prisma.user.findUnique({ where: { id: memberId } })
  if (!user) throw new Error("USER_NOT_FOUND")

  return runSerializableTransaction(async (tx) => {
    await lockGroupInvariants(tx, groupId)
    const admin = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: adminId } },
    })
    if (!admin?.isActive || admin.role !== "ADMIN") throw new Error("FORBIDDEN")

    const existing = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: memberId } },
    })
    if (existing?.isActive) throw new Error("MEMBER_ALREADY_ACTIVE")
    const activeMemberCount = await tx.groupMember.count({
      where: { groupId, isActive: true },
    })
    if (activeMemberCount >= MAX_GROUP_MEMBERS) throw new Error("GROUP_MEMBER_LIMIT")

    const member = await tx.groupMember.upsert({
      where: { groupId_userId: { groupId, userId: memberId } },
      create: { groupId, userId: memberId, role: "MEMBER" },
      // Возвращаем участника без прежних административных привилегий.
      update: { isActive: true, role: "MEMBER" },
      select: memberSelect,
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
    await recordGroupMemberJoined(tx, groupId, memberId)
    return member
  })
}

export async function removeMember(groupId: string, adminId: string, memberId: string) {
  // выйти может сам участник; удалить другого — только админ
  if (adminId !== memberId) await assertAdmin(groupId, adminId)

  const user = await prisma.user.findUnique({
    where: { id: memberId },
    select: { name: true },
  })

  return runSerializableTransaction(async (tx) => {
    await lockGroupInvariants(tx, groupId)
    const actor = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: adminId } },
    })
    if (!actor?.isActive) throw new Error("FORBIDDEN")
    if (adminId !== memberId && actor.role !== "ADMIN") throw new Error("FORBIDDEN")

    const target = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: memberId } },
    })
    if (!target?.isActive) throw new Error("NOT_FOUND")
    if (adminId === memberId && target.role === "ADMIN") {
      throw new Error("ADMIN_CANNOT_LEAVE")
    }

    // Balance check inside the transaction prevents A2 race
    const { raw } = await computeGroupDebts(groupId, tx)
    const balance = raw.find((b) => b.userId === memberId)?.balance ?? 0
    if (balance !== 0) throw new Error("MEMBER_HAS_BALANCE")

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
        metadata: { memberName: user?.name, selfLeft: adminId === memberId },
      },
    })
    await tx.group.update({ where: { id: groupId }, data: { updatedAt: new Date() } })
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
