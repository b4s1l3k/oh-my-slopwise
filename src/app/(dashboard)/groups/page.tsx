"use client"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { formatDate } from "@/lib/utils/format"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Plus, Users } from "lucide-react"

const GROUP_TYPE_LABELS: Record<string, string> = {
  HOME: "🏠 Дом",
  TRIP: "✈️ Поездка",
  COUPLE: "💑 Пара",
  OTHER: "📦 Другое",
}

export default function GroupsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["groups"],
    queryFn: async () => {
      const res = await fetch("/api/v1/groups")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Группы</h1>
        <Link href="/groups/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Создать группу
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : data?.groups?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-14 w-14 text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg">Нет групп</h3>
            <p className="text-muted-foreground text-sm mt-1 mb-6">
              Создайте группу чтобы начать делить расходы
            </p>
            <Link href="/groups/new">
              <Button>Создать первую группу</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data?.groups?.map(
            (group: {
              id: string
              name: string
              type: string
              currency: string
              members: unknown[]
              _count?: { expenses: number }
              updatedAt: string
            }) => (
              <Link key={group.id} href={`/groups/${group.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{group.name}</h3>
                          <Badge variant="secondary" className="text-xs">
                            {GROUP_TYPE_LABELS[group.type] ?? group.type}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {Array.isArray(group.members) ? group.members.length : 0} участников
                          {group._count && ` · ${group._count.expenses} расходов`}
                        </p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        {formatDate(group.updatedAt)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          )}
        </div>
      )}
    </div>
  )
}
