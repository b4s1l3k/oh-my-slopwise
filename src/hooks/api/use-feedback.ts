"use client"

import {
  mutationOptions,
  queryOptions,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { feedbackApi } from "@/lib/api/client/feedback-api"
import { invalidateFeedbackData } from "@/hooks/api/invalidation"
import { apiQueryKeys } from "@/hooks/api/query-keys"
import {
  mapAdminFeedbackViewModel,
  mapFeedbackViewModel,
} from "@/lib/api/view-models/mappers"

type CreateFeedbackCommand = Parameters<typeof feedbackApi.createFeedback>[0]

export function adminFeedbackQueryOptions() {
  return queryOptions({
    queryKey: apiQueryKeys.feedback.admin,
    queryFn: async ({ signal }) => {
      const response = await feedbackApi.getAdminFeedback({ signal })
      return response.feedbacks.map(mapAdminFeedbackViewModel)
    },
  })
}

export function createFeedbackMutationOptions(queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: async (command: CreateFeedbackCommand) => {
      const response = await feedbackApi.createFeedback(command)
      return mapFeedbackViewModel(response.feedback)
    },
    onSuccess: () => invalidateFeedbackData(queryClient),
  })
}

export function useAdminFeedbackQuery() {
  return useQuery(adminFeedbackQueryOptions())
}

export function useCreateFeedbackMutation() {
  const queryClient = useQueryClient()
  return useMutation(createFeedbackMutationOptions(queryClient))
}
