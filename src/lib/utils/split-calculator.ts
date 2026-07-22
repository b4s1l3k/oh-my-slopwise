export type SplitParticipant =
  | { userId: string }
  | { userId: string; amount: number }
  | { userId: string; percentage: number }
  | { userId: string; shares: number }

export type SplitResult = { userId: string; amount: number }

export function calculateSplits(
  totalAmount: number,
  splitType: "EQUAL" | "EXACT" | "PERCENTAGE" | "SHARES",
  participants: SplitParticipant[]
): SplitResult[] {
  if (participants.length === 0) return []

  switch (splitType) {
    case "EQUAL": {
      const share = Math.floor(totalAmount / participants.length)
      const remainder = totalAmount - share * participants.length
      return participants.map((p, i) => ({
        userId: p.userId,
        amount: i === 0 ? share + remainder : share,
      }))
    }

    case "EXACT": {
      return participants.map((p) => ({
        userId: p.userId,
        amount: (p as { userId: string; amount: number }).amount,
      }))
    }

    case "PERCENTAGE": {
      const results = participants.map((p) => ({
        userId: p.userId,
        amount: Math.floor(
          (totalAmount * (p as { userId: string; percentage: number }).percentage) / 10000
        ),
      }))
      const computed = results.reduce((s, r) => s + r.amount, 0)
      results[0].amount += totalAmount - computed
      return results
    }

    case "SHARES": {
      const totalShares = participants.reduce(
        (s, p) => s + (p as { userId: string; shares: number }).shares,
        0
      )
      const results = participants.map((p) => ({
        userId: p.userId,
        amount: Math.floor(
          (totalAmount * (p as { userId: string; shares: number }).shares) / totalShares
        ),
      }))
      const computed = results.reduce((s, r) => s + r.amount, 0)
      results[0].amount += totalAmount - computed
      return results
    }
  }
}
