import type {
  ApiOperationRequest,
  ApiOperationResponse,
} from "@contract/v1"
import {
  apiRequest,
  idempotentApiRequest,
  type ApiCallOptions,
} from "@/lib/api/client/http-client"

function pathSegment(value: string): string {
  return encodeURIComponent(value)
}

export const expensesApi = {
  getGroupExpenses: (groupId: string, cursor?: string | null, options?: ApiCallOptions) => {
    const search = new URLSearchParams()
    if (cursor != null) search.set("cursor", cursor)
    const query = search.size > 0 ? `?${search}` : ""
    return apiRequest<ApiOperationResponse<"listGroupExpensesV1", 200>>(
      `/groups/${pathSegment(groupId)}/expenses${query}`,
      options
    )
  },
  createExpense: (
    groupId: string,
    command: ApiOperationRequest<"createExpenseV1">,
    options?: ApiCallOptions
  ) =>
    idempotentApiRequest<ApiOperationResponse<"createExpenseV1", 201>>(
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
