import type { Prisma } from "@prisma/client"

export const STATISTIC_KIND = {
  groupCreated: "GROUP_CREATED",
  peer: "PEER",
  expenseCreated: "EXPENSE_CREATED",
  expenseParticipated: "EXPENSE_PARTICIPATED",
  expensePaid: "EXPENSE_PAID",
  createdForOther: "CREATED_FOR_OTHER",
  customRate: "CUSTOM_RATE",
  currency: "CURRENCY",
  settlementSent: "SETTLEMENT_SENT",
  settlementReceived: "SETTLEMENT_RECEIVED",
  cashSettlement: "CASH_SETTLEMENT",
  inviteCreated: "INVITE_CREATED",
  activeGroupsRecord: "ACTIVE_GROUPS_RECORD",
  expenseParticipantsRecord: "EXPENSE_PARTICIPANTS_RECORD",
  paidParticipantsRecord: "PAID_PARTICIPANTS_RECORD",
  groupMembersRecord: "GROUP_MEMBERS_RECORD",
  groupExpensesRecord: "GROUP_EXPENSES_RECORD",
} as const

type Tx = Prisma.TransactionClient
type Fact = { userId: string; kind: string; reference: string; value?: number }

const groupKind = (type: string) => `GROUP_JOINED_${type}`
const splitKind = (type: string) => `SPLIT_${type}`

async function addFacts(tx: Tx, facts: Fact[]) {
  if (facts.length === 0) return
  await tx.userStatisticFact.createMany({ data: facts, skipDuplicates: true })
}

async function keepRecordMaximum(tx: Tx, fact: Required<Fact>) {
  const updated = await tx.userStatisticFact.updateMany({
    where: {
      userId: fact.userId,
      kind: fact.kind,
      reference: fact.reference,
      value: { lt: fact.value },
    },
    data: { value: fact.value },
  })
  if (updated.count === 0) {
    await tx.userStatisticFact.createMany({ data: [fact], skipDuplicates: true })
  }
}

async function rememberActiveGroupRecord(tx: Tx, userId: string) {
  const activeGroups = await tx.groupMember.count({ where: { userId, isActive: true } })
  await keepRecordMaximum(tx, {
    userId,
    kind: STATISTIC_KIND.activeGroupsRecord,
    reference: "all",
    value: activeGroups,
  })
}

export async function recordGroupCreated(
  tx: Tx,
  group: { id: string; type: string; createdById: string },
  memberIds: string[]
) {
  const uniqueMemberIds = [...new Set(memberIds)]
  const facts: Fact[] = [
    {
      userId: group.createdById,
      kind: STATISTIC_KIND.groupCreated,
      reference: group.id,
    },
    ...uniqueMemberIds.map((userId) => ({
      userId,
      kind: groupKind(group.type),
      reference: group.id,
    })),
  ]

  for (const userId of uniqueMemberIds) {
    for (const peerId of uniqueMemberIds) {
      if (peerId !== userId) {
        facts.push({ userId, kind: STATISTIC_KIND.peer, reference: peerId })
      }
    }
  }
  await addFacts(tx, facts)

  for (const userId of uniqueMemberIds) {
    await rememberActiveGroupRecord(tx, userId)
    await keepRecordMaximum(tx, {
      userId,
      kind: STATISTIC_KIND.groupMembersRecord,
      reference: group.id,
      value: uniqueMemberIds.length,
    })
    await keepRecordMaximum(tx, {
      userId,
      kind: STATISTIC_KIND.groupExpensesRecord,
      reference: group.id,
      value: 0,
    })
  }
}

export async function recordGroupMemberJoined(tx: Tx, groupId: string, userId: string) {
  const group = await tx.group.findUnique({
    where: { id: groupId },
    select: {
      type: true,
      members: { where: { isActive: true }, select: { userId: true } },
      _count: { select: { expenses: true } },
    },
  })
  if (!group) return

  const memberIds = group.members.map((member) => member.userId)
  await addFacts(tx, [
    { userId, kind: groupKind(group.type), reference: groupId },
    ...memberIds.flatMap((memberId) => {
      if (memberId === userId) return []
      return [
        { userId, kind: STATISTIC_KIND.peer, reference: memberId },
        { userId: memberId, kind: STATISTIC_KIND.peer, reference: userId },
      ]
    }),
  ])

  for (const memberId of memberIds) {
    await keepRecordMaximum(tx, {
      userId: memberId,
      kind: STATISTIC_KIND.groupMembersRecord,
      reference: groupId,
      value: memberIds.length,
    })
  }
  await rememberActiveGroupRecord(tx, userId)
  await keepRecordMaximum(tx, {
    userId,
    kind: STATISTIC_KIND.groupExpensesRecord,
    reference: groupId,
    value: group._count.expenses,
  })
}

type ExpenseHistoryInput = {
  id: string
  groupId: string
  createdById: string
  paidById: string
  currency: string
  splitType: string
  customRate: number | null
  participantIds: string[]
}

export async function recordExpenseHistory(tx: Tx, expense: ExpenseHistoryInput) {
  const participantIds = [...new Set(expense.participantIds)]
  const relatedUserIds = [...new Set([
    expense.createdById,
    expense.paidById,
    ...participantIds,
  ])]
  const facts: Fact[] = [
    {
      userId: expense.createdById,
      kind: STATISTIC_KIND.expenseCreated,
      reference: expense.id,
    },
    {
      userId: expense.paidById,
      kind: STATISTIC_KIND.expensePaid,
      reference: expense.id,
    },
    {
      userId: expense.createdById,
      kind: splitKind(expense.splitType),
      reference: expense.id,
    },
    ...participantIds.map((userId) => ({
      userId,
      kind: STATISTIC_KIND.expenseParticipated,
      reference: expense.id,
    })),
    ...relatedUserIds.map((userId) => ({
      userId,
      kind: STATISTIC_KIND.currency,
      reference: expense.currency,
    })),
  ]
  if (expense.createdById !== expense.paidById) {
    facts.push({
      userId: expense.createdById,
      kind: STATISTIC_KIND.createdForOther,
      reference: expense.id,
    })
  }
  if (expense.customRate !== null) {
    facts.push({
      userId: expense.createdById,
      kind: STATISTIC_KIND.customRate,
      reference: expense.id,
    })
  }
  await addFacts(tx, facts)

  await keepRecordMaximum(tx, {
    userId: expense.createdById,
    kind: STATISTIC_KIND.expenseParticipantsRecord,
    reference: expense.id,
    value: participantIds.length,
  })
  if (expense.createdById === expense.paidById) {
    await keepRecordMaximum(tx, {
      userId: expense.createdById,
      kind: STATISTIC_KIND.paidParticipantsRecord,
      reference: expense.id,
      value: participantIds.length,
    })
  }

  const [groupExpenseCount, members] = await Promise.all([
    tx.expense.count({ where: { groupId: expense.groupId } }),
    tx.groupMember.findMany({
      where: { groupId: expense.groupId, isActive: true },
      select: { userId: true },
    }),
  ])
  for (const member of members) {
    await keepRecordMaximum(tx, {
      userId: member.userId,
      kind: STATISTIC_KIND.groupExpensesRecord,
      reference: expense.groupId,
      value: groupExpenseCount,
    })
  }
}

export async function recordSettlementHistory(
  tx: Tx,
  settlement: { id: string; fromUserId: string; toUserId: string; expenseId?: string | null }
) {
  await addFacts(tx, [
    {
      userId: settlement.fromUserId,
      kind: STATISTIC_KIND.settlementSent,
      reference: settlement.id,
    },
    {
      userId: settlement.toUserId,
      kind: STATISTIC_KIND.settlementReceived,
      reference: settlement.id,
    },
    ...(settlement.expenseId
      ? [{
          userId: settlement.fromUserId,
          kind: STATISTIC_KIND.cashSettlement,
          reference: settlement.id,
        }]
      : []),
  ])
}

export async function recordInviteHistory(
  tx: Tx,
  invite: { id: string; createdById: string }
) {
  await addFacts(tx, [{
    userId: invite.createdById,
    kind: STATISTIC_KIND.inviteCreated,
    reference: invite.id,
  }])
}
