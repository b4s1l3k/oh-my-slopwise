"use client"

import { queryOptions, useQuery } from "@tanstack/react-query"
import { groupsApi } from "@/lib/api/client/groups-api"
import { apiQueryKeys } from "@/hooks/api/query-keys"
import { mapActivityItemViewModel } from "@/lib/api/view-models/mappers"
import type { GroupActivityViewModel } from "@/lib/api/view-models/models"

export function activityQueryOptions() {
  return queryOptions({
    queryKey: apiQueryKeys.groups.activity,
    queryFn: async ({ signal }): Promise<GroupActivityViewModel[]> => {
      const { groups } = await groupsApi.getGroups({ signal })
      const groupsWithActivity = await Promise.all(
        groups.map(async (group) => {
          try {
            const { activities } = await groupsApi.getActivity(group.id, { signal })
            return {
              id: group.id,
              name: group.name,
              activities: activities.map(mapActivityItemViewModel),
            }
          } catch (error) {
            if (signal.aborted) throw error
            return { id: group.id, name: group.name, activities: [] }
          }
        })
      )

      return groupsWithActivity
        .filter((group) => group.activities.length > 0)
        .sort(
          (left, right) =>
            new Date(right.activities[0].createdAt).getTime() -
            new Date(left.activities[0].createdAt).getTime()
        )
    },
  })
}

export function useActivity() {
  return useQuery(activityQueryOptions())
}
