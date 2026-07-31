export type ExpenseUserPosition =
  | { kind: "PAID"; amount: number }
  | { kind: "OWES"; amount: number; cashPaid: number }
  | { kind: "SETTLED"; cashPaid: number }
  | { kind: "CASH_PAID"; cashPaid: number }

type Input = {
  currentUserId?: string
  paidById: string
  expenseAmount: number
  shareAmount?: number
  cashPaid?: number
}

/** Describes the current user's role in one expense, independently of who created it. */
export function getExpenseUserPosition({
  currentUserId,
  paidById,
  expenseAmount,
  shareAmount,
  cashPaid = 0,
}: Input): ExpenseUserPosition | null {
  if (!currentUserId) return null

  // paidBy is the source of truth. The payer does not have to be in the split.
  if (currentUserId === paidById) {
    return { kind: "PAID", amount: expenseAmount }
  }

  if (shareAmount !== undefined) {
    const remaining = Math.max(shareAmount - cashPaid, 0)
    if (remaining > 0) return { kind: "OWES", amount: remaining, cashPaid }
    if (cashPaid > 0) return { kind: "SETTLED", cashPaid }
  }

  // Keep malformed/legacy data understandable if a cash settlement exists
  // without a corresponding expense split.
  if (cashPaid > 0) return { kind: "CASH_PAID", cashPaid }

  return null
}
