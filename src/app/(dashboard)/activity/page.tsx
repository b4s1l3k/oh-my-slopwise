"use client"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { formatMoney, formatDateTime } from "@/lib/utils/format"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  Activity,
  Plus,
  Pencil,
  Trash2,
  ArrowLeftRight,
  RotateCcw,
  UserPlus,
  UserMinus,
  Settings,
  type LucideIcon,
} from "lucide-react"

type ActivityItem = {
  id: string
  type: string
  createdAt: string
  actor: { id: string; name: string } | null
  metadata: {
    title?: string
    amount?: number
    currency?: string
    toUserName?: string
    memberName?: string
    selfLeft?: boolean
    viaInvite?: boolean
    name?: string
    changes?: string[]
    removed?: number
  }
}
type GroupActivity = { id: string; name: string; activities: ActivityItem[] }

export default function ActivityPage() {
  const [selected, setSelected] = useState<string>("all")

  const { data: groups = [], isLoading } = useQuery<GroupActivity[]>({
    queryKey: ["activity"],
    queryFn: async () => {
      const res = await fetch("/api/v1/groups").then((r) => r.json())
      const list: { id: string; name: string }[] = res?.groups ?? []
      const withActivity = await Promise.all(
        list.map(async (g) => {
          const d = await fetch(`/api/v1/groups/${g.id}/activity`)
            .then((r) => r.json())
            .catch(() => ({ activities: [] }))
          return { id: g.id, name: g.name, activities: d.activities ?? [] } as GroupActivity
        })
      )
      return withActivity
        .filter((g) => g.activities.length > 0)
        .sort(
          (a, b) =>
            new Date(b.activities[0].createdAt).getTime() -
            new Date(a.activities[0].createdAt).getTime()
        )
    },
  })

  const visible = selected === "all" ? groups : groups.filter((g) => g.id === selected)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Активность</h1>
        <p className="text-sm text-muted-foreground">История изменений по каждой поездке</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Activity className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Активности пока нет</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {groups.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <FilterPill active={selected === "all"} onClick={() => setSelected("all")}>
                Все группы
              </FilterPill>
              {groups.map((g) => (
                <FilterPill key={g.id} active={selected === g.id} onClick={() => setSelected(g.id)}>
                  {g.name}
                </FilterPill>
              ))}
            </div>
          )}

          {visible.map((g) => (
            <section key={g.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{g.name}</h2>
                <span className="text-xs text-muted-foreground">
                  {g.activities.length} {plural(g.activities.length, "запись", "записи", "записей")}
                </span>
              </div>
              <Card>
                <CardContent className="p-4">
                  <ol className="relative ml-1 border-l pl-4 space-y-4">
                    {g.activities.map((a) => {
                      const money = a.metadata?.amount != null ? a.metadata : null
                      return (
                        <li key={a.id} className="relative">
                          <ActivityDot type={a.type} />
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm">
                                <span className="font-medium">{a.actor?.name ?? "Кто-то"}</span>{" "}
                                {activityText(a)}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                                  #{a.id.slice(0, 7)}
                                </code>{" "}
                                · {formatDateTime(a.createdAt)}
                              </p>
                            </div>
                            {money && (
                              <span className="text-sm font-semibold whitespace-nowrap">
                                {formatMoney(money.amount!, money.currency ?? "RUB")}
                              </span>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </CardContent>
              </Card>
            </section>
          ))}
        </>
      )}
    </div>
  )
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors",
        active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
      )}
    >
      {children}
    </button>
  )
}

function activityIcon(type: string): { Icon: LucideIcon; bg: string } {
  switch (type) {
    case "EXPENSE_CREATED":   return { Icon: Plus,             bg: "bg-emerald-500" }
    case "EXPENSE_UPDATED":   return { Icon: Pencil,           bg: "bg-amber-500" }
    case "EXPENSE_DELETED":   return { Icon: Trash2,           bg: "bg-red-500" }
    case "SETTLEMENT_CREATED":return { Icon: ArrowLeftRight,   bg: "bg-blue-500" }
    case "SETTLEMENTS_RESET": return { Icon: RotateCcw,        bg: "bg-orange-500" }
    case "MEMBER_ADDED":      return { Icon: UserPlus,         bg: "bg-violet-500" }
    case "MEMBER_REMOVED":    return { Icon: UserMinus,        bg: "bg-rose-500" }
    case "GROUP_UPDATED":     return { Icon: Settings,         bg: "bg-slate-500" }
    default:                  return { Icon: Activity,         bg: "bg-muted-foreground" }
  }
}

function ActivityDot({ type }: { type: string }) {
  const { Icon, bg } = activityIcon(type)
  return (
    <span
      className={cn(
        "absolute -left-[23px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-background",
        bg
      )}
    >
      <Icon className="h-3 w-3 text-white" />
    </span>
  )
}

function activityText(a: ActivityItem): string {
  const m = a.metadata ?? {}
  switch (a.type) {
    case "EXPENSE_CREATED":
      return `добавил(а) расход «${m.title}»`
    case "EXPENSE_UPDATED":
      return m.changes?.length
        ? `изменил(а) расход «${m.title}» (${m.changes.join(", ")})`
        : `изменил(а) расход «${m.title}»`
    case "EXPENSE_DELETED":
      return `удалил(а) расход «${m.title}»`
    case "SETTLEMENT_CREATED":
      return `рассчитался(-ась) с ${m.toUserName}`
    case "SETTLEMENTS_RESET":
      return m.removed ? `сбросил(а) расчёты (${m.removed})` : "сбросил(а) расчёты"
    case "MEMBER_ADDED":
      return m.viaInvite ? "вступил(а) в группу по ссылке" : `добавил(а) участника ${m.memberName}`
    case "MEMBER_REMOVED":
      return m.selfLeft ? "вышел(ла) из группы" : `удалил(а) участника ${m.memberName}`
    case "GROUP_UPDATED":
      return `переименовал(а) группу в «${m.name}»`
    default:
      return a.type
  }
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}
