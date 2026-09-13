import type { ExpensePageResponseDto, ExpenseResponseDto } from "@/lib/api/v1/response-dtos"
import { apiRequest, type ApiCallOptions } from "@/lib/api/client/http-client"
type ExpenseCommand = {
  title: string
  amount: number
  currency: string
  customRate?: number
  category?: string
  date: string
  paidById: string
  notes?: string
  splitType: "EQUAL" | "EXACT" | "PERCENTAGE"
  splits: Array<{ userId: string; amount?: number; percentage?: number }>
  cashPayments?: Array<{ userId: string; amount: number }>
}

function pathSegment(value: string): string {
  return encodeURIComponent(value)
}

export const expensesApi = {
  getExpense: (expenseId: string, options?: ApiCallOptions) =>
    apiRequest<ExpenseResponseDto>(`/expenses/${pathSegment(expenseId)}`, options),
  getGroupExpenses: (groupId: string, page: number, options?: ApiCallOptions) => {
    const search = new URLSearchParams({ page: String(page) })
    return apiRequest<ExpensePageResponseDto>(
      `/groups/${pathSegment(groupId)}/expenses?${search}`,
      options
    )
  },
  createExpense: (
    groupId: string,
    command: ExpenseCommand,
    options?: ApiCallOptions
  ) => apiRequest<ExpenseResponseDto>(`/groups/${pathSegment(groupId)}/expenses`, {
    ...options,
    method: "POST",
    body: command,
  }),
  updateExpense: (
    expenseId: string,
    command: ExpenseCommand,
    options?: ApiCallOptions
  ) => apiRequest<ExpenseResponseDto>(`/expenses/${pathSegment(expenseId)}`, {
    ...options,
    method: "PATCH",
    body: command,
  }),
  deleteExpense: (expenseId: string, options?: ApiCallOptions) =>
    apiRequest<Record<string, never>>(`/expenses/${pathSegment(expenseId)}`, {
      ...options,
      method: "DELETE",
    }),
}
