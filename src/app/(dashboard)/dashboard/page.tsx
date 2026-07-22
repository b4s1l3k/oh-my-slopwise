"use client"
import { useQuery } from "@tanstack/react-query"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { formatMoney } from "@/lib/utils/format"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Users, TrendingUp, TrendingDown, Plus } from "lucide-react"

type CurrencyTotal = { currency: string; owed: number; owe: number }
type FriendBalance = {
  userId: string
  userName: string
  balance: number
  currency: string
  groups: string[]
}

async function fetchOverview() {
  const res = await fetch("/api/v1/balances/overview")
  if (!res.ok) throw new Error("Failed to fetch")
  return res.json() as Promise<{ totals: CurrencyTotal[]; friendBalances: FriendBalance[] }>
}

async function fetchGroups() {
  const res = await fetch("/api/v1/groups")
  if (!res.ok) throw new Error("Failed to fetch")
  return res.json()
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const { data: overview, isLoading: loadingOverview } = useQuery({
    queryKey: ["overview"],
    queryFn: fetchOverview,
  })
  const { data: groupsData, isLoading: loadingGroups } = useQuery({
    queryKey: ["groups"],
    queryFn: fetchGroups,
  })

  const totals = overview?.totals ?? []
  const friends = overview?.friendBalances ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Привет{session?.user?.name ? `, ${session.user.name.split(" ")[0]}` : ""}!
        </h1>
        <p className="text-muted-foreground">Вот ваш финансовый обзор</p>
      </div>

      {/* Итоги: раздельно "вам должны" и "вы должны", по каждой валюте */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium text-muted-foreground">
            Ваш баланс
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingOverview ? (
            <Skeleton className="h-10 w-40" />
          ) : totals.length === 0 ? (
            <p className="text-muted-foreground">Все расчёты завершены 🎉</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Итоги — в валюте расчёта каждой поездки
              </p>
              {totals.map((t) => (
                <div key={t.currency} className="flex flex-wrap gap-6">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">вам должны</p>
                      <p className="text-xl font-bold text-green-600">
                        {formatMoney(t.owed, t.currency)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-destructive" />
                    <div>
                      <p className="text-xs text-muted-foreground">вы должны</p>
                      <p className="text-xl font-bold text-destructive">
                        {formatMoney(t.owe, t.currency)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Балансы с людьми */}
      {!loadingOverview && friends.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Балансы с людьми</h2>
          <div className="space-y-2">
            {friends.map((fb) => (
              <div
                key={`${fb.userId}:${fb.currency}`}
                className="flex items-center justify-between rounded-lg border bg-card px-4 py-3"
              >
                <div>
                  <p className="font-medium">{fb.userName}</p>
                  <p className="text-xs text-muted-foreground">{fb.groups.join(", ")}</p>
                </div>
                <div className="text-right">
                  <p
                    className={`font-semibold ${
                      fb.balance > 0 ? "text-green-600" : "text-destructive"
                    }`}
                  >
                    {fb.balance > 0 ? "+" : ""}
                    {formatMoney(fb.balance, fb.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fb.balance > 0 ? "вам должны" : "вы должны"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Группы */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Мои группы</h2>
          <Link href="/groups/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Создать
            </Button>
          </Link>
        </div>

        {loadingGroups ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : groupsData?.groups?.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="font-medium">Групп пока нет</p>
              <p className="text-sm text-muted-foreground mb-4">
                Создайте группу чтобы начать отслеживать расходы
              </p>
              <Link href="/groups/new">
                <Button>Создать группу</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {groupsData?.groups?.map(
              (group: { id: string; name: string; type: string; members: unknown[] }) => (
                <Link key={group.id} href={`/groups/${group.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold">{group.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {Array.isArray(group.members) ? group.members.length : 0} участников
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {groupTypeLabel(group.type)}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function groupTypeLabel(type: string) {
  const labels: Record<string, string> = {
    HOME: "Дом",
    TRIP: "Поездка",
    COUPLE: "Пара",
    OTHER: "Другое",
  }
  return labels[type] ?? type
}
