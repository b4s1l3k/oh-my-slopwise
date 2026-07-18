import type { User, Group, Expense, ExpenseSplit, Settlement, GroupMember } from "@prisma/client"

export type UserPublic = Pick<User, "id" | "name" | "email" | "avatarUrl">

export type GroupWithMembers = Group & {
  members: (GroupMember & { user: UserPublic })[]
  _count?: { expenses: number }
}

export type ExpenseWithDetails = Expense & {
  paidBy: UserPublic
  createdBy: UserPublic
  splits: (ExpenseSplit & { user: UserPublic })[]
}

export type SettlementWithUsers = Settlement & {
  fromUser: UserPublic
  toUser: UserPublic
}

export type SimplifiedDebt = {
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

export type GroupBalances = {
  simplified: SimplifiedDebt[]
  raw: UserBalance[]
}

export type OverviewBalance = {
  totalBalance: number
  friendBalances: {
    userId: string
    userName: string
    avatarUrl: string | null
    balance: number
    groups: string[]
  }[]
}
