export type Debt = {
  fromUserId: string
  fromUserName: string
  toUserId: string
  toUserName: string
  amount: number
}

export type UserBalance = {
  userId: string
  userName: string
  balance: number
}

type NetMap = Record<string, number>
type NameMap = Record<string, string>

export function calculateSimplifiedDebtsFromBalances(
  balances: Array<{ userId: string; balance: number }>,
  userNames: NameMap
): { simplified: Debt[]; raw: UserBalance[] } {
  const net: NetMap = Object.fromEntries(
    balances.map(({ userId, balance }) => [userId, balance])
  )

  const raw: UserBalance[] = Object.entries(net).map(([userId, balance]) => ({
    userId,
    userName: userNames[userId] ?? userId,
    balance,
  }))

  const creditors = Object.entries(net)
    .filter(([, value]) => value > 0)
    .map(([id, amount]) => ({ id, amount }))
    .sort((left, right) => right.amount - left.amount || left.id.localeCompare(right.id))

  const debtors = Object.entries(net)
    .filter(([, value]) => value < 0)
    .map(([id, value]) => ({ id, amount: -value }))
    .sort((left, right) => right.amount - left.amount || left.id.localeCompare(right.id))

  const simplified: Debt[] = []
  let creditorIndex = 0
  let debtorIndex = 0

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex]
    const debtor = debtors[debtorIndex]
    const settled = Math.min(creditor.amount, debtor.amount)

    if (settled > 0) {
      simplified.push({
        fromUserId: debtor.id,
        fromUserName: userNames[debtor.id] ?? debtor.id,
        toUserId: creditor.id,
        toUserName: userNames[creditor.id] ?? creditor.id,
        amount: settled,
      })
    }

    creditor.amount -= settled
    debtor.amount -= settled
    if (creditor.amount === 0) creditorIndex++
    if (debtor.amount === 0) debtorIndex++
  }

  return { simplified, raw }
}

export function calculateSimplifiedDebts(
  expenses: Array<{
    paidById: string
    splits: Array<{ userId: string; amount: number }>
  }>,
  settlements: Array<{ fromUserId: string; toUserId: string; amount: number }>,
  userNames: NameMap
): { simplified: Debt[]; raw: UserBalance[] } {
  const net: NetMap = {}

  const ensure = (id: string) => {
    if (!(id in net)) net[id] = 0
  }

  for (const expense of expenses) {
    ensure(expense.paidById)
    for (const split of expense.splits) {
      ensure(split.userId)
      if (split.userId !== expense.paidById) {
        net[expense.paidById] += split.amount
        net[split.userId] -= split.amount
      }
    }
  }

  for (const s of settlements) {
    ensure(s.fromUserId)
    ensure(s.toUserId)
    net[s.fromUserId] += s.amount
    net[s.toUserId] -= s.amount
  }

  return calculateSimplifiedDebtsFromBalances(
    Object.entries(net).map(([userId, balance]) => ({ userId, balance })),
    userNames
  )
}
