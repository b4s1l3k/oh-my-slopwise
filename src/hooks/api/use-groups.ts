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
import { invalidateCreatedGroup } from "@/hooks/api/invalidation"
import { apiQueryKeys } from "@/hooks/api/query-keys"
import { mapGroupViewModel } from "@/lib/api/view-models/mappers"

export type CreateGroupCommand = Parameters<typeof groupsApi.createGroup>[0]

export function groupsQueryOptions() {
  return queryOptions({
    queryKey: apiQueryKeys.groups.all,
    queryFn: async ({ signal }) => {
      const response = await groupsApi.getGroups({ signal })
      return response.groups.map(mapGroupViewModel)
    },
  })
}

export function createGroupMutationOptions(
  queryClient: QueryClient
) {
  return mutationOptions({
    mutationFn: async (command: CreateGroupCommand) => {
      const response = await groupsApi.createGroup(command)
      return mapGroupViewModel(response.group)
    },
    onSuccess: () => invalidateCreatedGroup(queryClient),
  })
}

export function useGroups() {
  return useQuery(groupsQueryOptions())
}

export function useCreateGroup() {
  const queryClient = useQueryClient()
  return useMutation(createGroupMutationOptions(queryClient))
}
