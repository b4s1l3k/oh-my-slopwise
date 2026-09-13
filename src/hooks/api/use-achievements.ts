"use client"

import { useCallback } from "react"
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"
import { usersApi } from "@/lib/api/client/users-api"
import { apiQueryKeys } from "@/hooks/api/query-keys"
import {
  mapAchievementCollectionViewModel,
  mapAchievementUnlockViewModel,
  mapProfileStatisticsViewModel,
} from "@/lib/api/view-models/mappers"

export function achievementsQueryOptions() {
  return queryOptions({
    queryKey: apiQueryKeys.users.achievements,
    queryFn: async ({ signal }) =>
      mapAchievementCollectionViewModel(await usersApi.getAchievements({ signal })),
  })
}

export function statisticsQueryOptions() {
  return queryOptions({
    queryKey: apiQueryKeys.users.statistics,
    queryFn: async ({ signal }) => {
      const response = await usersApi.getStatistics({ signal })
      return mapProfileStatisticsViewModel(response.statistics)
    },
  })
}

export function useAchievementsQuery() {
  return useQuery(achievementsQueryOptions())
}

export function useStatisticsQuery() {
  return useQuery(statisticsQueryOptions())
}

export function useCollectUnseenAchievements() {
  const queryClient = useQueryClient()
  return useCallback(
    async (signal?: AbortSignal) => {
      const response = await usersApi.collectUnseenAchievements({ signal })
      const unlocked = response.unlocked.map(mapAchievementUnlockViewModel)
      if (unlocked.length > 0) {
        void queryClient.invalidateQueries({ queryKey: apiQueryKeys.users.achievements })
      }
      return unlocked
    },
    [queryClient]
  )
}
