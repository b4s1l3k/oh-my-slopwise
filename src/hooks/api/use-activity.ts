"use client"

import { infiniteQueryOptions, useInfiniteQuery } from "@tanstack/react-query"
import { apiQueryKeys } from "@/hooks/api/query-keys"
import { activityApi } from "@/lib/api/client/activity-api"
import { mapAccountActivityPageViewModel } from "@/lib/api/view-models/mappers"
import type {
  AccountActivityItemViewModel,
  GroupActivityViewModel,
} from "@/lib/api/view-models/models"

export function accountActivityInfiniteQueryOptions() {
  return infiniteQueryOptions({
    queryKey: apiQueryKeys.groups.activity,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) =>
      mapAccountActivityPageViewModel(
        await activityApi.getActivity(pageParam, undefined, { signal })
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
}

export function groupAccountActivity(
  activities: AccountActivityItemViewModel[]
): GroupActivityViewModel[] {
  const groups = new Map<string, GroupActivityViewModel>()

  for (const activity of activities) {
    const group = groups.get(activity.group.id)
    if (group) {
      group.activities.push(activity)
    } else {
      groups.set(activity.group.id, {
        id: activity.group.id,
        name: activity.group.name,
        activities: [activity],
      })
    }
  }

  return [...groups.values()]
}

export function useActivity() {
  const query = useInfiniteQuery(accountActivityInfiniteQueryOptions())
  const activities = query.data?.pages.flatMap((page) => page.activities) ?? []

  return {
    ...query,
    data: groupAccountActivity(activities),
  }
}
