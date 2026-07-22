import { prisma } from "@/lib/db"
import { calculateSimplifiedDebts } from "@/lib/utils/balance-calculator"

type DbClient = Pick<typeof prisma, "expense" | "settlement" | "groupMember">

// Считает упрощённые долги группы В ВАЛЮТЕ РАСЧЁТА группы.
// Траты могут быть в разных валютах, поэтому берём amountBase (уже пересчитано
// в валюту расчёта на дату операции). Имена — по ВСЕМ участникам (в т.ч. вышедшим).
export async function computeGroupDebts(groupId: string, db: DbClient = prisma) {
  const [expenses, settlements, members] = await Promise.all([
    db.expense.findMany({ where: { groupId }, include: { splits: true } }),
    db.settlement.findMany({ where: { groupId } }),
    db.groupMember.findMany({
      where: { groupId },
      include: { user: { select: { id: true, name: true } } },
    }),
  ])

  const userNames = Object.fromEntries(members.map((m) => [m.userId, m.user.name]))
  const expensesInSettlement = expenses.map((e) => ({
    paidById: e.paidById,
    splits: e.splits.map((s) => ({ userId: s.userId, amount: s.amountBase ?? s.amount })),
  }))
  const settlementsInSettlement = settlements.map((s) => ({
    fromUserId: s.fromUserId,
    toUserId: s.toUserId,
    amount: s.amountBase ?? s.amount,
  }))
  return calculateSimplifiedDebts(expensesInSettlement, settlementsInSettlement, userNames)
}

export async function getGroupBalances(groupId: string, userId: string) {
  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  })
  if (!member?.isActive) throw new Error("FORBIDDEN")
  return computeGroupDebts(groupId)
}

// Сколько userId сейчас должен получателю toUserId в этой группе (упрощённый долг)
export async function getOutstandingDebt(
  groupId: string,
  fromUserId: string,
  toUserId: string,
  db: DbClient = prisma
): Promise<number> {
  const { simplified } = await computeGroupDebts(groupId, db)
  const debt = simplified.find(
    (d) => d.fromUserId === fromUserId && d.toUserId === toUserId
  )
  return debt?.amount ?? 0
}

export type FriendBalance = {
  userId: string
  userName: string
  avatarUrl: string | null
  balance: number
  currency: string
  groups: string[]
}

export type CurrencyTotal = { currency: string; owed: number; owe: number }

export async function getOverviewBalances(userId: string) {
  const memberships = await prisma.groupMember.findMany({
    where: { userId, isActive: true },
    include: {
      group: {
        include: {
          expenses: { include: { splits: true } },
          settlements: true,
          members: {
            include: { user: { select: { id: true, name: true, avatarUrl: true } } },
          },
        },
      },
    },
  })

  // Балансы каждой поездки — в ЕЁ валюте расчёта (amountBase). Валюты не смешиваем:
  // копим по паре (друг + валюта расчёта), на дашборде показываем раздельно.
  const friendBalances: Record<string, FriendBalance> = {}

  for (const membership of memberships) {
    const { group } = membership
    const currency = group.currency
    const userNames = Object.fromEntries(group.members.map((m) => [m.userId, m.user.name]))
    const expensesInSettlement = group.expenses.map((e) => ({
      paidById: e.paidById,
      splits: e.splits.map((s) => ({ userId: s.userId, amount: s.amountBase ?? s.amount })),
    }))
    const settlementsInSettlement = group.settlements.map((s) => ({
      fromUserId: s.fromUserId,
      toUserId: s.toUserId,
      amount: s.amountBase ?? s.amount,
    }))
    const { simplified } = calculateSimplifiedDebts(
      expensesInSettlement,
      settlementsInSettlement,
      userNames
    )

    for (const debt of simplified) {
      const isFromMe = debt.fromUserId === userId
      const isToMe = debt.toUserId === userId
      if (!isFromMe && !isToMe) continue

      const otherId = isFromMe ? debt.toUserId : debt.fromUserId
      const otherName = isFromMe ? debt.toUserName : debt.fromUserName
      const otherMember = group.members.find((m) => m.userId === otherId)
      const key = `${otherId}:${currency}`

      if (!friendBalances[key]) {
        friendBalances[key] = {
          userId: otherId,
          userName: otherName,
          avatarUrl: otherMember?.user.avatarUrl ?? null,
          balance: 0,
          currency,
          groups: [],
        }
      }

      // balance > 0 → вам должны; < 0 → вы должны
      friendBalances[key].balance += isToMe ? debt.amount : -debt.amount
      if (!friendBalances[key].groups.includes(group.name)) {
        friendBalances[key].groups.push(group.name)
      }
    }
  }

  const list = Object.values(friendBalances).filter((f) => f.balance !== 0)

  // Итоги раздельно и по каждой валюте
  const totalsMap: Record<string, CurrencyTotal> = {}
  for (const f of list) {
    if (!totalsMap[f.currency]) {
      totalsMap[f.currency] = { currency: f.currency, owed: 0, owe: 0 }
    }
    if (f.balance > 0) totalsMap[f.currency].owed += f.balance
    else totalsMap[f.currency].owe += -f.balance
  }

  return { totals: Object.values(totalsMap), friendBalances: list }
}
