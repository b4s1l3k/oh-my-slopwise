import { prisma } from "@/lib/db"
import { calculateSimplifiedDebtsFromBalances } from "@/lib/utils/balance-calculator"

type DbClient = Pick<typeof prisma, "groupMemberPosition" | "groupMember">

function toSafeBalance(value: bigint): number {
  const balance = Number(value)
  if (!Number.isSafeInteger(balance)) throw new Error("BALANCE_OUT_OF_RANGE")
  return balance
}

// Считает упрощённые долги группы В ВАЛЮТЕ РАСЧЁТА группы.
// Траты могут быть в разных валютах, поэтому берём amountBase (уже пересчитано
// в валюту расчёта на дату операции). Имена — по ВСЕМ участникам (в т.ч. вышедшим).
export async function computeGroupDebts(groupId: string, db: DbClient = prisma) {
  const [positions, members] = await Promise.all([
    db.groupMemberPosition.findMany({
      where: { groupId },
      select: { userId: true, balance: true },
      orderBy: { userId: "asc" },
    }),
    db.groupMember.findMany({
      where: { groupId },
      select: { userId: true, user: { select: { id: true, name: true } } },
    }),
  ])

  const userNames = Object.fromEntries(members.map((m) => [m.userId, m.user.name]))
  const balances = positions.map((position) => ({
    userId: position.userId,
    balance: toSafeBalance(position.balance),
  }))
  if (balances.reduce((sum, position) => sum + position.balance, 0) !== 0) {
    throw new Error("POSITION_IMBALANCE")
  }
  return calculateSimplifiedDebtsFromBalances(balances, userNames)
}

export async function assertNoInactiveMemberBalances(
  groupId: string,
  db: DbClient = prisma
) {
  const inactiveMembers = await db.groupMember.findMany({
    where: { groupId, isActive: false },
    select: { userId: true },
  })
  if (inactiveMembers.length === 0) return

  const inactiveUserIds = new Set(inactiveMembers.map((member) => member.userId))
  const { raw } = await computeGroupDebts(groupId, db)
  if (raw.some((balance) => inactiveUserIds.has(balance.userId) && balance.balance !== 0)) {
    throw new Error("INACTIVE_MEMBER_HAS_BALANCE")
  }
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

type OverviewBalanceRow = {
  invalidPosition: boolean
  userId: string | null
  userName: string | null
  avatarUrl: string | null
  balance: string | null
  currency: string | null
  groups: string[] | null
}

export async function getOverviewBalances(userId: string) {
  // Greedy simplification pairs creditors and debtors ordered by amount DESC,
  // userId ASC. Prefix intervals reproduce that exact matching in SQL. The DB
  // scans positions only for the caller's active groups and returns only the
  // caller's incident edges, aggregated to the public (friend, currency) shape.
  const rows = await prisma.$queryRaw<OverviewBalanceRow[]>`
    WITH selected_positions AS MATERIALIZED (
      SELECT position."groupId",
             position."userId",
             position."balance",
             group_data."name" AS group_name,
             group_data."currency"
      FROM "group_members" membership
      JOIN "groups" group_data ON group_data."id" = membership."groupId"
      JOIN "group_member_positions" position ON position."groupId" = membership."groupId"
      WHERE membership."userId" = ${userId}
        AND membership."isActive" = true
        AND position."balance" <> 0
    ),
    creditor_ends AS (
      SELECT selected.*,
             sum(selected."balance") OVER (
               PARTITION BY selected."groupId"
               ORDER BY selected."balance" DESC, selected."userId" COLLATE "C"
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
             ) AS range_end
      FROM selected_positions selected
      WHERE selected."balance" > 0
    ),
    creditors AS (
      SELECT creditor_ends.*,
             creditor_ends.range_end - creditor_ends."balance" AS range_start
      FROM creditor_ends
    ),
    debtor_ends AS (
      SELECT selected.*,
             sum(-selected."balance") OVER (
               PARTITION BY selected."groupId"
               ORDER BY -selected."balance" DESC, selected."userId" COLLATE "C"
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
             ) AS range_end
      FROM selected_positions selected
      WHERE selected."balance" < 0
    ),
    debtors AS (
      SELECT debtor_ends.*,
             debtor_ends.range_end + debtor_ends."balance" AS range_start
      FROM debtor_ends
    ),
    incident_edges AS (
      SELECT creditor."userId" AS other_user_id,
             debtor.group_name,
             debtor."currency",
             -(least(creditor.range_end, debtor.range_end)
               - greatest(creditor.range_start, debtor.range_start)) AS signed_balance
      FROM debtors debtor
      JOIN creditors creditor
        ON creditor."groupId" = debtor."groupId"
       AND creditor.range_start < debtor.range_end
       AND debtor.range_start < creditor.range_end
      WHERE debtor."userId" = ${userId}
      UNION ALL
      SELECT debtor."userId" AS other_user_id,
             creditor.group_name,
             creditor."currency",
             least(creditor.range_end, debtor.range_end)
               - greatest(creditor.range_start, debtor.range_start) AS signed_balance
      FROM creditors creditor
      JOIN debtors debtor
        ON debtor."groupId" = creditor."groupId"
       AND creditor.range_start < debtor.range_end
       AND debtor.range_start < creditor.range_end
      WHERE creditor."userId" = ${userId}
    ),
    friend_balances AS (
      SELECT incident.other_user_id,
             account."name" AS user_name,
             account."avatarUrl" AS avatar_url,
             incident."currency",
             sum(incident.signed_balance) AS balance,
             array_agg(DISTINCT incident.group_name ORDER BY incident.group_name) AS groups
      FROM incident_edges incident
      JOIN "users" account ON account."id" = incident.other_user_id
      GROUP BY incident.other_user_id, account."name", account."avatarUrl", incident."currency"
      HAVING sum(incident.signed_balance) <> 0
    )
    SELECT false AS "invalidPosition",
           friend.other_user_id AS "userId",
           friend.user_name AS "userName",
           friend.avatar_url AS "avatarUrl",
           friend.balance::text AS "balance",
           friend."currency",
           friend.groups
    FROM friend_balances friend
    UNION ALL
    SELECT true AS "invalidPosition",
           NULL::text AS "userId",
           NULL::text AS "userName",
           NULL::text AS "avatarUrl",
           NULL::text AS "balance",
           NULL::text AS "currency",
           NULL::text[] AS groups
    WHERE EXISTS (
      SELECT 1
      FROM selected_positions selected
      WHERE selected."balance" > 9007199254740991
         OR selected."balance" < -9007199254740991
    )
    ORDER BY "invalidPosition" DESC, "currency", "userId"
  `

  if (rows.some((row) => row.invalidPosition)) throw new Error("BALANCE_OUT_OF_RANGE")

  const friendBalances = rows.map((row): FriendBalance => {
    if (
      row.userId === null ||
      row.userName === null ||
      row.balance === null ||
      row.currency === null ||
      row.groups === null
    ) {
      throw new Error("INVALID_BALANCE_PROJECTION")
    }
    return {
      userId: row.userId,
      userName: row.userName,
      avatarUrl: row.avatarUrl,
      balance: toSafeBalance(BigInt(row.balance)),
      currency: row.currency,
      groups: row.groups,
    }
  })

  const totals = [...friendBalances.reduce((byCurrency, friend) => {
    const total = byCurrency.get(friend.currency) ?? {
      currency: friend.currency,
      owed: BigInt(0),
      owe: BigInt(0),
    }
    const balance = BigInt(friend.balance)
    if (balance > 0) total.owed += balance
    else total.owe -= balance
    byCurrency.set(friend.currency, total)
    return byCurrency
  }, new Map<string, { currency: string; owed: bigint; owe: bigint }>()).values()]
    .map((total): CurrencyTotal => ({
      currency: total.currency,
      owed: toSafeBalance(total.owed),
      owe: toSafeBalance(total.owe),
    }))

  return { totals, friendBalances }
}
