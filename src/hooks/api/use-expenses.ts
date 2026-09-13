"use client"

import {
  infiniteQueryOptions,
  mutationOptions,
  queryOptions,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
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

export function expenseQueryOptions(groupId: string, expenseId: string) {
  return queryOptions({
    queryKey: apiQueryKeys.expenses.detail(groupId, expenseId),
    queryFn: async ({ signal }) => {
      const response = await expensesApi.getExpense(expenseId, { signal })
      return mapExpenseViewModel(response.expense)
    },
  })
}

export function groupExpensesInfiniteQueryOptions(groupId: string) {
  return infiniteQueryOptions({
    queryKey: apiQueryKeys.expenses.list(groupId),
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => {
      const response = await expensesApi.getGroupExpenses(groupId, pageParam, { signal })
      return mapExpensePageViewModel(response)
    },
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasNext ? pages.length + 1 : undefined,
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

export function useExpense(groupId: string, expenseId: string) {
  return useQuery(expenseQueryOptions(groupId, expenseId))
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
