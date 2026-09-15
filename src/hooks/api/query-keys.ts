export const apiQueryKeys = {
  groups: {
    all: ["groups"] as const,
    details: ["group"] as const,
    detail: (groupId: string) => ["group", groupId] as const,
    activity: ["activity"] as const,
  },
  expenses: {
    all: ["expenses"] as const,
    list: (groupId: string) => ["expenses", groupId] as const,
    detail: (groupId: string, expenseId: string) =>
      ["expenses", groupId, "detail", expenseId] as const,
  },
  balances: {
    all: ["balances"] as const,
    overview: ["overview"] as const,
    group: (groupId: string) => ["balances", groupId] as const,
  },
  users: {
    profile: ["profile"] as const,
    searches: ["users", "search"] as const,
    search: (query: string) => ["users", "search", query] as const,
    achievements: ["achievements"] as const,
    statistics: ["statistics"] as const,
  },
  invites: {
    all: ["invite"] as const,
    detail: (token: string) => ["invite", token] as const,
  },
  feedback: {
    admin: ["admin", "feedback"] as const,
  },
} as const

export type ApiQueryKey = readonly unknown[]
