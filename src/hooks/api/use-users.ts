"use client"

import {
  mutationOptions,
  queryOptions,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { usersApi } from "@/lib/api/client/users-api"
import { invalidateProfileData } from "@/hooks/api/invalidation"
import { apiQueryKeys } from "@/hooks/api/query-keys"
import {
  mapProfileViewModel,
  mapRegisteredUserViewModel,
  mapUserSummaryViewModel,
} from "@/lib/api/view-models/mappers"

type RegisterUserCommand = Parameters<typeof usersApi.registerUser>[0]
type UpdateProfileCommand = Parameters<typeof usersApi.updateProfile>[0]

export function normalizeUserSearchQuery(query: string): string {
  return query.trim()
}

export function profileQueryOptions() {
  return queryOptions({
    queryKey: apiQueryKeys.users.profile,
    queryFn: async ({ signal }) => {
      const response = await usersApi.getProfile({ signal })
      return response.user ? mapProfileViewModel(response.user) : null
    },
  })
}

export function userSearchQueryOptions(query: string) {
  const normalizedQuery = normalizeUserSearchQuery(query)
  return queryOptions({
    queryKey: apiQueryKeys.users.search(normalizedQuery),
    queryFn: async ({ signal }) => {
      const response = await usersApi.searchUsers(normalizedQuery, { signal })
      return response.users.map(mapUserSummaryViewModel)
    },
    enabled: normalizedQuery.length >= 2,
  })
}

export function registerUserMutationOptions() {
  return mutationOptions({
    mutationFn: async (command: RegisterUserCommand) => {
      const response = await usersApi.registerUser(command)
      return mapRegisteredUserViewModel(response.user)
    },
  })
}

export function updateProfileMutationOptions(queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: async (command: UpdateProfileCommand) => {
      const response = await usersApi.updateProfile(command)
      return response.user ? mapProfileViewModel(response.user) : null
    },
    onSuccess: () => invalidateProfileData(queryClient),
  })
}

export function useProfileQuery() {
  return useQuery(profileQueryOptions())
}

export function useUserSearchQuery(query: string) {
  return useQuery(userSearchQueryOptions(query))
}

export function useRegisterUserMutation() {
  return useMutation(registerUserMutationOptions())
}

export function useUpdateProfileMutation() {
  const queryClient = useQueryClient()
  return useMutation(updateProfileMutationOptions(queryClient))
}
