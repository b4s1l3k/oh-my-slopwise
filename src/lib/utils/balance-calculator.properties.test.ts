import { describe, expect, it } from "vitest"
import { calculateSimplifiedDebts, type Debt, type UserBalance } from "./balance-calculator"

type Expense = {
  paidById: string
  splits: Array<{ userId: string; amount: number }>
}

type Settlement = { fromUserId: string; toUserId: string; amount: number }

const names = Object.fromEntries(
  Array.from({ length: 12 }, (_, index) => [`user-${index}`, `User ${index}`])
)

function balancesById(raw: UserBalance[]) {
  return Object.fromEntries(
    raw
      .map(({ userId, balance }) => [userId, balance] as const)
      .sort(([left], [right]) => left.localeCompare(right))
  )
}

function balancesReconstructedFromDebts(debts: Debt[]) {
  const balances: Record<string, number> = {}
  for (const debt of debts) {
    balances[debt.fromUserId] = (balances[debt.fromUserId] ?? 0) - debt.amount
    balances[debt.toUserId] = (balances[debt.toUserId] ?? 0) + debt.amount
  }
  return balances
}

const scenarios: Array<{
  name: string
  expenses: Expense[]
  settlements: Settlement[]
}> = [
  {
    name: "expense only",
    expenses: [{
      paidById: "user-0",
      splits: [
        { userId: "user-0", amount: 1 },
        { userId: "user-1", amount: 2 },
        { userId: "user-2", amount: 3 },
      ],
    }],
    settlements: [],
  },
  {
    name: "settlements only",
    expenses: [],
    settlements: [
      { fromUserId: "user-0", toUserId: "user-1", amount: 11 },
      { fromUserId: "user-2", toUserId: "user-0", amount: 4 },
    ],
  },
  {
    name: "dense mixed graph",
    expenses: [
      {
        paidById: "user-0",
        splits: Array.from({ length: 8 }, (_, index) => ({
          userId: `user-${index}`,
          amount: index + 1,
        })),
      },
      {
        paidById: "user-3",
        splits: [
          { userId: "user-0", amount: 7 },
          { userId: "user-3", amount: 13 },
          { userId: "user-8", amount: 17 },
          { userId: "user-9", amount: 19 },
        ],
      },
      {
        paidById: "user-10",
        splits: [
          { userId: "user-1", amount: 2_000_000_000 },
          { userId: "user-10", amount: 1 },
        ],
      },
    ],
    settlements: [
      { fromUserId: "user-7", toUserId: "user-0", amount: 2 },
      { fromUserId: "user-1", toUserId: "user-10", amount: 999_999_999 },
      { fromUserId: "user-11", toUserId: "user-3", amount: 23 },
    ],
  },
]

describe("calculateSimplifiedDebts deterministic properties", () => {
  it.each(scenarios)("conserves the zero-sum invariant for $name", ({ expenses, settlements }) => {
    const result = calculateSimplifiedDebts(expenses, settlements, names)

    expect(result.raw.reduce((sum, balance) => sum + balance.balance, 0)).toBe(0)
    expect(result.simplified.every((debt) => Number.isInteger(debt.amount) && debt.amount > 0)).toBe(true)
  })

  it.each(scenarios)("simplified debts reconstruct raw balances for $name", ({ expenses, settlements }) => {
    const { raw, simplified } = calculateSimplifiedDebts(expenses, settlements, names)
    const reconstructed = balancesReconstructedFromDebts(simplified)

    for (const balance of raw) {
      expect(reconstructed[balance.userId] ?? 0).toBe(balance.balance)
    }
  })

  it.each(scenarios)("expense and settlement order does not change raw balances for $name", ({ expenses, settlements }) => {
    const original = calculateSimplifiedDebts(expenses, settlements, names).raw
    const reversed = calculateSimplifiedDebts(
      [...expenses].reverse(),
      [...settlements].reverse(),
      names
    ).raw

    expect(balancesById(reversed)).toEqual(balancesById(original))
  })

  it("splitting one expense into equivalent rows does not change balances", () => {
    const whole: Expense[] = [{
      paidById: "user-0",
      splits: [
        { userId: "user-0", amount: 30 },
        { userId: "user-1", amount: 70 },
        { userId: "user-2", amount: 100 },
      ],
    }]
    const split: Expense[] = [
      {
        paidById: "user-0",
        splits: [
          { userId: "user-0", amount: 10 },
          { userId: "user-1", amount: 20 },
          { userId: "user-2", amount: 40 },
        ],
      },
      {
        paidById: "user-0",
        splits: [
          { userId: "user-0", amount: 20 },
          { userId: "user-1", amount: 50 },
          { userId: "user-2", amount: 60 },
        ],
      },
    ]

    expect(balancesById(calculateSimplifiedDebts(split, [], names).raw)).toEqual(
      balancesById(calculateSimplifiedDebts(whole, [], names).raw)
    )
  })

  it("adding equal opposite settlements is neutral", () => {
    const expenses = scenarios[0].expenses
    const baseline = calculateSimplifiedDebts(expenses, [], names)
    const withNeutralPair = calculateSimplifiedDebts(expenses, [
      { fromUserId: "user-1", toUserId: "user-2", amount: 987_654_321 },
      { fromUserId: "user-2", toUserId: "user-1", amount: 987_654_321 },
    ], names)

    expect(balancesById(withNeutralPair.raw)).toEqual(balancesById(baseline.raw))
    expect(withNeutralPair.simplified).toEqual(baseline.simplified)
  })

  it("a self-directed settlement has no financial effect but keeps the user visible", () => {
    const result = calculateSimplifiedDebts(
      [],
      [{ fromUserId: "user-4", toUserId: "user-4", amount: 2_000_000_000 }],
      names
    )

    expect(result.raw).toEqual([{ userId: "user-4", userName: "User 4", balance: 0 }])
    expect(result.simplified).toEqual([])
  })

  it("every simplified transfer connects a debtor to a creditor and uses public names", () => {
    const { raw, simplified } = calculateSimplifiedDebts(
      scenarios[2].expenses,
      scenarios[2].settlements,
      names
    )
    const rawById = Object.fromEntries(raw.map((balance) => [balance.userId, balance.balance]))

    for (const debt of simplified) {
      expect(rawById[debt.fromUserId]).toBeLessThan(0)
      expect(rawById[debt.toUserId]).toBeGreaterThan(0)
      expect(debt.fromUserName).toBe(names[debt.fromUserId])
      expect(debt.toUserName).toBe(names[debt.toUserId])
    }
  })

  it("uses at most debtors plus creditors minus one transfers", () => {
    const { raw, simplified } = calculateSimplifiedDebts(
      scenarios[2].expenses,
      scenarios[2].settlements,
      names
    )
    const nonZeroParticipants = raw.filter((balance) => balance.balance !== 0).length

    expect(simplified.length).toBeLessThanOrEqual(nonZeroParticipants - 1)
  })

  it("uses first-seen insertion order as the tie-break for equal positions", () => {
    const visibilityRows: Expense[] = [
      { paidById: "user-0", splits: [{ userId: "user-0", amount: 0 }] },
      { paidById: "user-3", splits: [{ userId: "user-3", amount: 0 }] },
      { paidById: "user-1", splits: [{ userId: "user-1", amount: 0 }] },
      { paidById: "user-2", splits: [{ userId: "user-2", amount: 0 }] },
    ]
    const financialRows: Expense[] = [
      {
        paidById: "user-0",
        splits: [
          { userId: "user-0", amount: 1 },
          { userId: "user-2", amount: 100 },
        ],
      },
      {
        paidById: "user-1",
        splits: [
          { userId: "user-1", amount: 1 },
          { userId: "user-3", amount: 100 },
        ],
      },
    ]

    expect(calculateSimplifiedDebts([...visibilityRows, ...financialRows], [], names).simplified)
      .toEqual([
        {
          fromUserId: "user-3",
          fromUserName: "User 3",
          toUserId: "user-0",
          toUserName: "User 0",
          amount: 100,
        },
        {
          fromUserId: "user-2",
          fromUserName: "User 2",
          toUserId: "user-1",
          toUserName: "User 1",
          amount: 100,
        },
      ])
  })
})
