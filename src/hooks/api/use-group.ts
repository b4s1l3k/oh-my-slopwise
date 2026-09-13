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
import {
  invalidateCreatedInvite,
  invalidateDeletedGroup,
  invalidateGroupData,
  invalidateRevokedInvites,
} from "@/hooks/api/invalidation"
import { apiQueryKeys } from "@/hooks/api/query-keys"
import {
  mapGroupMemberViewModel,
  mapGroupViewModel,
  mapRequisitesViewModel,
} from "@/lib/api/view-models/mappers"

export type UpdateGroupCommand = Parameters<typeof groupsApi.updateGroup>[1]
export type UpdateGroupRequisitesCommand = Parameters<typeof groupsApi.updateRequisites>[1]

export function groupQueryOptions(groupId: string) {
  return queryOptions({
    queryKey: apiQueryKeys.groups.detail(groupId),
    queryFn: async ({ signal }) => {
      const response = await groupsApi.getGroup(groupId, { signal })
      return mapGroupViewModel(response.group)
    },
  })
}

export function updateGroupMutationOptions(
  queryClient: QueryClient,
  groupId: string
) {
  return mutationOptions({
    mutationFn: async (command: UpdateGroupCommand) => {
      const response = await groupsApi.updateGroup(groupId, command)
      return mapGroupViewModel(response.group)
    },
    onSuccess: () => invalidateGroupData(queryClient, groupId),
  })
}

export function updateGroupRequisitesMutationOptions(
  queryClient: QueryClient,
  groupId: string
) {
  return mutationOptions({
    mutationFn: async (command: UpdateGroupRequisitesCommand) => {
      const response = await groupsApi.updateRequisites(groupId, command)
      return mapRequisitesViewModel(response.requisites)
    },
    onSuccess: () => invalidateGroupData(queryClient, groupId),
  })
}

export function createGroupInviteMutationOptions(
  queryClient: QueryClient,
  groupId: string
) {
  return mutationOptions({
    mutationFn: async () => (await groupsApi.createInvite(groupId)).token,
    onSuccess: () => invalidateCreatedInvite(queryClient),
  })
}

export function revokeGroupInviteMutationOptions(
  queryClient: QueryClient,
  groupId: string
) {
  return mutationOptions({
    mutationFn: () => groupsApi.revokeInvite(groupId),
    onSuccess: () => invalidateRevokedInvites(queryClient),
  })
}

export function addGroupMemberMutationOptions(
  queryClient: QueryClient,
  groupId: string
) {
  return mutationOptions({
    mutationFn: async (userId: string) => {
      const response = await groupsApi.addMember(groupId, userId)
      return mapGroupMemberViewModel(response.member)
    },
    onSuccess: () => invalidateGroupData(queryClient, groupId),
  })
}

export function removeGroupMemberMutationOptions(
  queryClient: QueryClient,
  groupId: string
) {
  return mutationOptions({
    mutationFn: (userId: string) => groupsApi.removeMember(groupId, userId),
    onSuccess: () => invalidateGroupData(queryClient, groupId),
  })
}

export function leaveGroupMutationOptions(
  queryClient: QueryClient,
  groupId: string
) {
  return mutationOptions({
    mutationFn: (userId: string) => groupsApi.removeMember(groupId, userId),
    onSuccess: () => invalidateDeletedGroup(queryClient, groupId),
  })
}

export function deleteGroupMutationOptions(
  queryClient: QueryClient,
  groupId: string
) {
  return mutationOptions({
    mutationFn: () => groupsApi.deleteGroup(groupId),
    onSuccess: () => invalidateDeletedGroup(queryClient, groupId),
  })
}

export function useGroup(groupId: string) {
  return useQuery(groupQueryOptions(groupId))
}

export function useUpdateGroup(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation(updateGroupMutationOptions(queryClient, groupId))
}

export function useUpdateGroupRequisites(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation(updateGroupRequisitesMutationOptions(queryClient, groupId))
}

export function useCreateGroupInvite(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation(createGroupInviteMutationOptions(queryClient, groupId))
}

export function useRevokeGroupInvite(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation(revokeGroupInviteMutationOptions(queryClient, groupId))
}

export function useAddGroupMember(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation(addGroupMemberMutationOptions(queryClient, groupId))
}

export function useRemoveGroupMember(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation(removeGroupMemberMutationOptions(queryClient, groupId))
}

export function useLeaveGroup(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation(leaveGroupMutationOptions(queryClient, groupId))
}

export function useDeleteGroup(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation(deleteGroupMutationOptions(queryClient, groupId))
}
