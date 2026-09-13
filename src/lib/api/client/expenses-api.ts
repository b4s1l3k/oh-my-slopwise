import type {
  ApiOperationRequest,
  ApiOperationResponse,
} from "@contract/v1"
import { apiRequest, type ApiCallOptions } from "@/lib/api/client/http-client"

function pathSegment(value: string): string {
  return encodeURIComponent(value)
}

export const expensesApi = {
  getExpense: (expenseId: string, options?: ApiCallOptions) =>
    apiRequest<ApiOperationResponse<"getExpenseV1", 200>>(
      `/expenses/${pathSegment(expenseId)}`,
      options
    ),
  getGroupExpenses: (groupId: string, page: number, options?: ApiCallOptions) => {
    const search = new URLSearchParams({ page: String(page) })
    return apiRequest<ApiOperationResponse<"listGroupExpensesV1", 200>>(
      `/groups/${pathSegment(groupId)}/expenses?${search}`,
      options
    )
  },
  createExpense: (
    groupId: string,
    command: ApiOperationRequest<"createExpenseV1">,
    options?: ApiCallOptions
  ) =>
    apiRequest<ApiOperationResponse<"createExpenseV1", 201>>(
      `/groups/${pathSegment(groupId)}/expenses`,
      {
        ...options,
        method: "POST",
        body: command,
      }
    ),
  updateExpense: (
    expenseId: string,
    command: ApiOperationRequest<"updateExpenseV1">,
    options?: ApiCallOptions
  ) =>
    apiRequest<ApiOperationResponse<"updateExpenseV1", 200>>(
      `/expenses/${pathSegment(expenseId)}`,
      {
        ...options,
        method: "PATCH",
        body: command,
      }
    ),
  deleteExpense: (expenseId: string, options?: ApiCallOptions) =>
    apiRequest<ApiOperationResponse<"deleteExpenseV1", 200>>(
      `/expenses/${pathSegment(expenseId)}`,
      {
        ...options,
        method: "DELETE",
      }
    ),
}
