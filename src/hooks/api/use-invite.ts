"use client"

import {
  mutationOptions,
  queryOptions,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { groupsApi } from "@/lib/api/client/groups-api"
import { invalidateAcceptedInvite } from "@/hooks/api/invalidation"
import { apiQueryKeys } from "@/hooks/api/query-keys"
import { mapInviteViewModel } from "@/lib/api/view-models/mappers"

export function inviteQueryOptions(token: string) {
  return queryOptions({
    queryKey: apiQueryKeys.invites.detail(token),
    queryFn: async ({ signal }) => {
      const response = await groupsApi.getInvite(token, { signal })
      return mapInviteViewModel(response.invite)
    },
    retry: false,
  })
}

export function acceptInviteMutationOptions(
  queryClient: QueryClient,
  token: string
) {
  return mutationOptions({
    mutationFn: async () => (await groupsApi.acceptInvite(token)).groupId,
    onSuccess: (groupId) => invalidateAcceptedInvite(queryClient, groupId, token),
  })
}

export function useInvite(token: string) {
  return useQuery(inviteQueryOptions(token))
}

export function useAcceptInvite(token: string) {
  const queryClient = useQueryClient()
  return useMutation(acceptInviteMutationOptions(queryClient, token))
}
