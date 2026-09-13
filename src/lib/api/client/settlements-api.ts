import type {
  ApiOperationRequest,
  ApiOperationResponse,
} from "@contract/v1"
import { apiRequest, type ApiCallOptions } from "@/lib/api/client/http-client"

function pathSegment(value: string): string {
  return encodeURIComponent(value)
}

export const settlementsApi = {
  createSettlement: (
    command: ApiOperationRequest<"createSettlementV1">,
    options?: ApiCallOptions
  ) =>
    apiRequest<ApiOperationResponse<"createSettlementV1", 201>>("/settlements", {
      ...options,
      method: "POST",
      body: command,
    }),
  getOverviewBalances: (options?: ApiCallOptions) =>
    apiRequest<ApiOperationResponse<"getBalanceOverviewV1", 200>>(
      "/balances/overview",
      options
    ),
  getGroupBalances: (groupId: string, options?: ApiCallOptions) =>
    apiRequest<ApiOperationResponse<"getGroupBalancesV1", 200>>(
      `/groups/${pathSegment(groupId)}/balances`,
      options
    ),
  getGroupSettlements: (groupId: string, options?: ApiCallOptions) =>
    apiRequest<ApiOperationResponse<"listGroupSettlementsV1", 200>>(
      `/groups/${pathSegment(groupId)}/settlements`,
      options
    ),
  resetGroupSettlements: (groupId: string, options?: ApiCallOptions) =>
    apiRequest<ApiOperationResponse<"resetGroupSettlementsV1", 200>>(
      `/groups/${pathSegment(groupId)}/settlements`,
      { ...options, method: "DELETE" }
    ),
}
