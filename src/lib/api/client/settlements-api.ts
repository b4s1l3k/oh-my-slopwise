import type {
  BalanceOverviewDto,
  GroupBalancesResponseDto,
  ResetSettlementsResponseDto,
  SettlementListResponseDto,
  SettlementResponseDto,
} from "@/lib/api/v1/response-dtos"
import { apiRequest, type ApiCallOptions } from "@/lib/api/client/http-client"
import type { CreateSettlementInput } from "@/lib/validations/settlement"

function pathSegment(value: string): string {
  return encodeURIComponent(value)
}

export const settlementsApi = {
  createSettlement: (command: CreateSettlementInput, options?: ApiCallOptions) =>
    apiRequest<SettlementResponseDto>("/settlements", {
      ...options,
      method: "POST",
      body: command,
    }),
  getOverviewBalances: (options?: ApiCallOptions) =>
    apiRequest<BalanceOverviewDto>("/balances/overview", options),
  getGroupBalances: (groupId: string, options?: ApiCallOptions) =>
    apiRequest<GroupBalancesResponseDto>(`/groups/${pathSegment(groupId)}/balances`, options),
  getGroupSettlements: (groupId: string, options?: ApiCallOptions) =>
    apiRequest<SettlementListResponseDto>(
      `/groups/${pathSegment(groupId)}/settlements`,
      options
    ),
  resetGroupSettlements: (groupId: string, options?: ApiCallOptions) =>
    apiRequest<ResetSettlementsResponseDto>(`/groups/${pathSegment(groupId)}/settlements`, {
      ...options,
      method: "DELETE",
    }),
}
