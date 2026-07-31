"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import type { LucideIcon } from "lucide-react"
import {
  Banknote,
  BookOpen,
  Calculator,
  CalendarDays,
  CircleCheckBig,
  Crown,
  Equal,
  Globe2,
  Handshake,
  Heart,
  History,
  House,
  Lock,
  PartyPopper,
  Pencil,
  Percent,
  Plane,
  ReceiptText,
  Ruler,
  Shield,
  Sparkles,
  Star,
  Trophy,
  UserRoundPlus,
  Users,
  Utensils,
  Wallet,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { Achievement, AchievementCategory } from "@/lib/achievements"
import { cn } from "@/lib/utils"

type AchievementsResponse = {
  summary: { unlocked: number; total: number }
  achievements: Achievement[]
}

const categoryLabels: Record<AchievementCategory, string> = {
  START: "Первые шаги",
  ACTIVITY: "Активность",
  TEAM: "Вместе",
  SETTLEMENTS: "Расчёты",
  MASTERY: "Функции",
  GROUPS: "Группы",
}

const iconMap: Record<string, LucideIcon> = {
  banknote: Banknote,
  "book-open": BookOpen,
  calculator: Calculator,
  calendar: CalendarDays,
  "circle-check": CircleCheckBig,
  crown: Crown,
  equal: Equal,
  globe: Globe2,
  handshake: Handshake,
  heart: Heart,
  history: History,
  house: House,
  lock: Lock,
  "party-popper": PartyPopper,
  pencil: Pencil,
  percent: Percent,
  plane: Plane,
  receipt: ReceiptText,
  ruler: Ruler,
  shield: Shield,
  sparkles: Sparkles,
  star: Star,
  "user-plus": UserRoundPlus,
  users: Users,
  "users-round": Users,
  utensils: Utensils,
  wallet: Wallet,
}

function AchievementCard({ achievement }: { achievement: Achievement }) {
  const Icon = iconMap[achievement.icon] ?? Trophy
  const secret = achievement.hidden && !achievement.unlocked

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-colors",
        achievement.unlocked
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-muted/20"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            achievement.unlocked
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold leading-tight">{achievement.title}</h3>
            {achievement.unlocked && <Badge className="shrink-0">Получено</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{achievement.description}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {categoryLabels[achievement.category]}
          </p>
        </div>
      </div>

      {!achievement.unlocked && !secret && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/60 transition-all"
              style={{ width: `${achievement.percent}%` }}
            />
          </div>
          <p className="mt-1.5 text-right text-xs text-muted-foreground">
            {Math.min(achievement.progress, achievement.target)} из {achievement.target}
          </p>
        </div>
      )}
    </div>
  )
}

export function AchievementsSection() {
  const [showAll, setShowAll] = useState(false)
  const { data, isLoading, isError } = useQuery({
    queryKey: ["achievements"],
    queryFn: async () => {
      const response = await fetch("/api/v1/users/me/achievements")
      if (!response.ok) throw new Error("Failed to load achievements")
      return (await response.json()) as AchievementsResponse
    },
  })

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-52" />
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (isError || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ачивки</CardTitle>
          <CardDescription>Не удалось загрузить достижения. Попробуйте обновить страницу.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const ordered = [...data.achievements].sort((left, right) => {
    if (left.unlocked !== right.unlocked) return left.unlocked ? -1 : 1
    if (!left.unlocked && left.percent !== right.percent) return right.percent - left.percent
    return 0
  })
  const visible = showAll ? ordered : ordered.slice(0, 8)
  const overallPercent = Math.round((data.summary.unlocked / data.summary.total) * 100)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-5 w-5 text-primary" aria-hidden="true" />
              Ачивки
            </CardTitle>
            <CardDescription className="mt-1">
              Открыто {data.summary.unlocked} из {data.summary.total}
            </CardDescription>
          </div>
          <Badge variant="secondary">{overallPercent}%</Badge>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${overallPercent}%` }}
          />
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((achievement) => (
            <AchievementCard key={achievement.id} achievement={achievement} />
          ))}
        </div>

        {ordered.length > 8 && (
          <Button
            type="button"
            variant="outline"
            className="mt-4 w-full"
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll ? "Свернуть" : `Показать все (${ordered.length})`}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
