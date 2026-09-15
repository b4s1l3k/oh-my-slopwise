"use client"

import {
  infiniteQueryOptions,
  mutationOptions,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import {
  invalidateDeletedExpense,
  invalidateExpenseData,
  invalidateUpdatedExpense,
} from "@/hooks/api/invalidation"
import { apiQueryKeys } from "@/hooks/api/query-keys"
import { expensesApi } from "@/lib/api/client/expenses-api"
import {
  mapExpensePageViewModel,
  mapExpenseViewModel,
} from "@/lib/api/view-models/mappers"

export type CreateExpenseCommand = Parameters<typeof expensesApi.createExpense>[1]
export type UpdateExpenseCommand = Parameters<typeof expensesApi.updateExpense>[1]

export function groupExpensesInfiniteQueryOptions(groupId: string) {
  return infiniteQueryOptions({
    queryKey: apiQueryKeys.expenses.list(groupId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      const response = await expensesApi.getGroupExpenses(groupId, pageParam, { signal })
      return mapExpensePageViewModel(response)
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
}

export function createExpenseMutationOptions(
  queryClient: QueryClient,
  groupId: string
) {
  return mutationOptions({
    mutationFn: async (command: CreateExpenseCommand) => {
      const response = await expensesApi.createExpense(groupId, command)
      return mapExpenseViewModel(response.expense)
    },
    onSuccess: () => invalidateExpenseData(queryClient, groupId),
  })
}

export function updateExpenseMutationOptions(
  queryClient: QueryClient,
  groupId: string,
  expenseId: string
) {
  return mutationOptions({
    mutationFn: async (command: UpdateExpenseCommand) => {
      const response = await expensesApi.updateExpense(expenseId, command)
      return mapExpenseViewModel(response.expense)
    },
    onSuccess: () => invalidateUpdatedExpense(queryClient, groupId, expenseId),
  })
}

export function deleteExpenseMutationOptions(
  queryClient: QueryClient,
  groupId: string
) {
  return mutationOptions({
    mutationFn: (expenseId: string) => expensesApi.deleteExpense(expenseId),
    onSuccess: (_data, expenseId) =>
      invalidateDeletedExpense(queryClient, groupId, expenseId),
  })
}

export function useGroupExpenses(groupId: string) {
  return useInfiniteQuery(groupExpensesInfiniteQueryOptions(groupId))
}

export function useCreateExpense(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation(createExpenseMutationOptions(queryClient, groupId))
}

export function useUpdateExpense(groupId: string, expenseId: string) {
  const queryClient = useQueryClient()
  return useMutation(updateExpenseMutationOptions(queryClient, groupId, expenseId))
}

export function useDeleteExpense(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation(deleteExpenseMutationOptions(queryClient, groupId))
}
