"use client"
import { useQuery } from "@tanstack/react-query"
import { formatMoney, formatDate } from "@/lib/utils/format"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Activity } from "lucide-react"

export default function ActivityPage() {
  const { data: activities = [], isLoading } = useQuery({
    queryKey: ["activity"],
    queryFn: async () => {
      const groups = await fetch("/api/v1/groups").then((r) => r.json())
      if (!groups?.groups?.length) return []
      const all = await Promise.all(
        groups.groups.map((g: { id: string; name: string }) =>
          fetch(`/api/v1/groups/${g.id}/activity`)
            .then((r) => r.json())
            .then((d) =>
              (d.activities ?? []).map((a: object) => ({ ...a, groupName: g.name }))
            )
            .catch(() => [])
        )
      )
      return all
        .flat()
        .sort(
          (a: { createdAt: string }, b: { createdAt: string }) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
    },
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Активность</h1>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : activities.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Activity className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Активности пока нет</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {activities.map(
            (a: {
              id: string
              type: string
              actor: { name: string }
              metadata: { title?: string; amount?: number; toUserName?: string }
              groupName: string
              createdAt: string
            }) => (
              <Card key={a.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm">
                        <span className="font-medium">{a.actor?.name}</span>{" "}
                        {activityText(a.type, a.metadata)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {a.groupName} · {formatDate(a.createdAt)}
                      </p>
                    </div>
                    {a.metadata?.amount && (
                      <span className="text-sm font-semibold whitespace-nowrap">
                        {formatMoney(a.metadata.amount)}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          )}
        </div>
      )}
    </div>
  )
}

function activityText(
  type: string,
  meta: { title?: string; amount?: number; toUserName?: string }
): string {
  switch (type) {
    case "EXPENSE_CREATED":
      return `добавил(а) расход "${meta.title}"`
    case "EXPENSE_DELETED":
      return `удалил(а) расход "${meta.title}"`
    case "SETTLEMENT_CREATED":
      return `рассчитался(-ась) с ${meta.toUserName}`
    case "MEMBER_ADDED":
      return "добавлен(а) в группу"
    default:
      return type
  }
}
