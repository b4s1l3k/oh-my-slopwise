import type { QueryClient } from "@tanstack/react-query"
import { apiQueryKeys, type ApiQueryKey } from "@/hooks/api/query-keys"

function invalidate(queryClient: QueryClient, queryKey: ApiQueryKey): void {
  void queryClient.invalidateQueries({ queryKey })
}

export function invalidateCreatedGroup(queryClient: QueryClient): void {
  invalidate(queryClient, apiQueryKeys.groups.all)
  invalidate(queryClient, apiQueryKeys.balances.overview)
  invalidate(queryClient, apiQueryKeys.groups.activity)
  invalidate(queryClient, apiQueryKeys.users.achievements)
  invalidate(queryClient, apiQueryKeys.users.statistics)
}

export function invalidateGroupData(queryClient: QueryClient, groupId: string): void {
  invalidate(queryClient, apiQueryKeys.groups.all)
  invalidate(queryClient, apiQueryKeys.groups.detail(groupId))
  invalidate(queryClient, apiQueryKeys.groups.activity)
  invalidate(queryClient, apiQueryKeys.balances.group(groupId))
  invalidate(queryClient, apiQueryKeys.balances.overview)
  invalidate(queryClient, apiQueryKeys.users.achievements)
  invalidate(queryClient, apiQueryKeys.users.statistics)
}

export function invalidateDeletedGroup(queryClient: QueryClient, groupId: string): void {
  invalidateGroupData(queryClient, groupId)
  void queryClient.removeQueries({ queryKey: apiQueryKeys.groups.detail(groupId) })
  void queryClient.removeQueries({ queryKey: apiQueryKeys.expenses.list(groupId) })
  void queryClient.removeQueries({ queryKey: apiQueryKeys.balances.group(groupId) })
}

export function invalidateExpenseData(queryClient: QueryClient, groupId: string): void {
  invalidate(queryClient, apiQueryKeys.groups.all)
  invalidate(queryClient, apiQueryKeys.groups.detail(groupId))
  invalidate(queryClient, apiQueryKeys.expenses.list(groupId))
  invalidate(queryClient, apiQueryKeys.balances.group(groupId))
  invalidate(queryClient, apiQueryKeys.balances.overview)
  invalidate(queryClient, apiQueryKeys.groups.activity)
  invalidate(queryClient, apiQueryKeys.users.achievements)
  invalidate(queryClient, apiQueryKeys.users.statistics)
}

export function invalidateUpdatedExpense(
  queryClient: QueryClient,
  groupId: string,
  expenseId: string
): void {
  invalidateExpenseData(queryClient, groupId)
  invalidate(queryClient, apiQueryKeys.expenses.detail(groupId, expenseId))
}

export function invalidateDeletedExpense(
  queryClient: QueryClient,
  groupId: string,
  expenseId: string
): void {
  invalidateExpenseData(queryClient, groupId)
  void queryClient.removeQueries({
    queryKey: apiQueryKeys.expenses.detail(groupId, expenseId),
  })
}

export function invalidateSettlementData(queryClient: QueryClient, groupId: string): void {
  invalidate(queryClient, apiQueryKeys.groups.all)
  invalidate(queryClient, apiQueryKeys.groups.detail(groupId))
  invalidate(queryClient, apiQueryKeys.balances.group(groupId))
  invalidate(queryClient, apiQueryKeys.balances.overview)
  invalidate(queryClient, apiQueryKeys.groups.activity)
  invalidate(queryClient, apiQueryKeys.users.achievements)
  invalidate(queryClient, apiQueryKeys.users.statistics)
}

export function invalidateCreatedInvite(queryClient: QueryClient): void {
  invalidate(queryClient, apiQueryKeys.users.achievements)
  invalidate(queryClient, apiQueryKeys.users.statistics)
}

export function invalidateRevokedInvites(queryClient: QueryClient): void {
  invalidate(queryClient, apiQueryKeys.invites.all)
}

export function invalidateAcceptedInvite(
  queryClient: QueryClient,
  groupId: string,
  token: string
): void {
  invalidateGroupData(queryClient, groupId)
  invalidate(queryClient, apiQueryKeys.invites.detail(token))
}

export function invalidateProfileData(queryClient: QueryClient): void {
  invalidate(queryClient, apiQueryKeys.users.profile)
  invalidate(queryClient, apiQueryKeys.groups.details)
  invalidate(queryClient, apiQueryKeys.groups.all)
  invalidate(queryClient, apiQueryKeys.expenses.all)
  invalidate(queryClient, apiQueryKeys.balances.all)
  invalidate(queryClient, apiQueryKeys.balances.overview)
  invalidate(queryClient, apiQueryKeys.groups.activity)
  invalidate(queryClient, apiQueryKeys.users.searches)
  invalidate(queryClient, apiQueryKeys.users.achievements)
  invalidate(queryClient, apiQueryKeys.users.statistics)
  invalidate(queryClient, apiQueryKeys.feedback.admin)
}

export function invalidateFeedbackData(queryClient: QueryClient): void {
  invalidate(queryClient, apiQueryKeys.feedback.admin)
}
