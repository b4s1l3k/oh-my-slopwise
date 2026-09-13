"use client"

import {
  mutationOptions,
  queryOptions,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { invalidateSettlementData } from "@/hooks/api/invalidation"
import { apiQueryKeys } from "@/hooks/api/query-keys"
import { settlementsApi } from "@/lib/api/client/settlements-api"
import {
  mapBalanceOverviewViewModel,
  mapGroupBalancesViewModel,
  mapSettlementViewModel,
} from "@/lib/api/view-models/mappers"

export type CreateSettlementCommand = Parameters<typeof settlementsApi.createSettlement>[0]

export function overviewBalancesQueryOptions() {
  return queryOptions({
    queryKey: apiQueryKeys.balances.overview,
    queryFn: async ({ signal }) =>
      mapBalanceOverviewViewModel(await settlementsApi.getOverviewBalances({ signal })),
  })
}

export function groupBalancesQueryOptions(groupId: string) {
  return queryOptions({
    queryKey: apiQueryKeys.balances.group(groupId),
    queryFn: async ({ signal }) => {
      const response = await settlementsApi.getGroupBalances(groupId, { signal })
      return mapGroupBalancesViewModel(response.balances)
    },
  })
}

export function groupSettlementsQueryOptions(groupId: string) {
  return queryOptions({
    queryKey: apiQueryKeys.settlements.group(groupId),
    queryFn: async ({ signal }) => {
      const response = await settlementsApi.getGroupSettlements(groupId, { signal })
      return response.settlements.map(mapSettlementViewModel)
    },
  })
}

export function createSettlementMutationOptions(queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: async (command: CreateSettlementCommand) => {
      const response = await settlementsApi.createSettlement(command)
      return mapSettlementViewModel(response.settlement)
    },
    onSuccess: (_data, command) =>
      invalidateSettlementData(queryClient, command.groupId),
  })
}

export function resetGroupSettlementsMutationOptions(
  queryClient: QueryClient,
  groupId: string
) {
  return mutationOptions({
    mutationFn: async () => (await settlementsApi.resetGroupSettlements(groupId)).removed,
    onSuccess: () => invalidateSettlementData(queryClient, groupId),
  })
}

export function useOverviewBalances() {
  return useQuery(overviewBalancesQueryOptions())
}

export function useGroupBalances(groupId: string) {
  return useQuery(groupBalancesQueryOptions(groupId))
}

export function useGroupSettlements(groupId: string) {
  return useQuery(groupSettlementsQueryOptions(groupId))
}

export function useCreateSettlement() {
  const queryClient = useQueryClient()
  return useMutation(createSettlementMutationOptions(queryClient))
}

export function useResetGroupSettlements(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation(resetGroupSettlementsMutationOptions(queryClient, groupId))
}
