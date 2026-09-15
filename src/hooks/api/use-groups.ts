"use client"

import {
  infiniteQueryOptions,
  mutationOptions,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { groupsApi } from "@/lib/api/client/groups-api"
import { invalidateCreatedGroup } from "@/hooks/api/invalidation"
import { apiQueryKeys } from "@/hooks/api/query-keys"
import {
  mapGroupPageViewModel,
  mapGroupViewModel,
} from "@/lib/api/view-models/mappers"

export type CreateGroupCommand = Parameters<typeof groupsApi.createGroup>[0]

export function groupsInfiniteQueryOptions() {
  return infiniteQueryOptions({
    queryKey: apiQueryKeys.groups.all,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      const response = await groupsApi.getGroups(pageParam, { signal })
      return mapGroupPageViewModel(response)
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
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
  return useInfiniteQuery({
    ...groupsInfiniteQueryOptions(),
    select: (data) => data.pages.flatMap((page) => page.groups),
  })
}

export function useCreateGroup() {
  const queryClient = useQueryClient()
  return useMutation(createGroupMutationOptions(queryClient))
}
