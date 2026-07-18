import { prisma } from "@/lib/db"
import { calculateSimplifiedDebts } from "@/lib/utils/balance-calculator"

export async function getGroupBalances(groupId: string, userId: string) {
  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  })
  if (!member) throw new Error("FORBIDDEN")

  const [expenses, settlements, members] = await Promise.all([
    prisma.expense.findMany({
      where: { groupId },
      include: { splits: true },
    }),
    prisma.settlement.findMany({ where: { groupId } }),
    prisma.groupMember.findMany({
      where: { groupId, isActive: true },
      include: { user: { select: { id: true, name: true } } },
    }),
  ])

  const userNames = Object.fromEntries(members.map((m) => [m.userId, m.user.name]))

  return calculateSimplifiedDebts(expenses, settlements, userNames)
}

export async function getOverviewBalances(userId: string) {
  const memberships = await prisma.groupMember.findMany({
    where: { userId, isActive: true },
    include: {
      group: {
        include: {
          expenses: { include: { splits: true } },
          settlements: true,
          members: {
            where: { isActive: true },
            include: { user: { select: { id: true, name: true, avatarUrl: true } } },
          },
        },
      },
    },
  })

  const friendBalances: Record<
    string,
    { userId: string; userName: string; avatarUrl: string | null; balance: number; groups: string[] }
  > = {}

  for (const membership of memberships) {
    const { group } = membership
    const userNames = Object.fromEntries(
      group.members.map((m) => [m.userId, m.user.name])
    )
    const { simplified } = calculateSimplifiedDebts(
      group.expenses,
      group.settlements,
      userNames
    )

    for (const debt of simplified) {
      const isFromMe = debt.fromUserId === userId
      const isToMe = debt.toUserId === userId
      if (!isFromMe && !isToMe) continue

      const otherId = isFromMe ? debt.toUserId : debt.fromUserId
      const otherName = isFromMe ? debt.toUserName : debt.fromUserName
      const otherMember = group.members.find((m) => m.userId === otherId)

      if (!friendBalances[otherId]) {
        friendBalances[otherId] = {
          userId: otherId,
          userName: otherName,
          avatarUrl: otherMember?.user.avatarUrl ?? null,
          balance: 0,
          groups: [],
        }
      }

      friendBalances[otherId].balance += isToMe ? debt.amount : -debt.amount
      if (!friendBalances[otherId].groups.includes(group.name)) {
        friendBalances[otherId].groups.push(group.name)
      }
    }
  }

  const list = Object.values(friendBalances).filter((f) => f.balance !== 0)
  const totalBalance = list.reduce((s, f) => s + f.balance, 0)

  return { totalBalance, friendBalances: list }
}
