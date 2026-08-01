"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  BarChart3,
  CalendarDays,
  Globe2,
  Handshake,
  ReceiptText,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { ProfileStatistics } from "@/lib/statistics"

type StatisticsResponse = {
  lifetime: ProfileStatistics
  current: ProfileStatistics
}

const numberFormatter = new Intl.NumberFormat("ru-RU")

function formatNumber(value: number) {
  return numberFormatter.format(value)
}

function StatValue({ label, value, icon: Icon }: {
  label: string
  value: number
  icon: LucideIcon
}) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-2xl font-bold tabular-nums">{formatNumber(value)}</p>
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

function SplitRow({ label, value, total }: { label: string; value: number; total: number }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="font-medium tabular-nums">{formatNumber(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary/70" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}

export function StatisticsSection() {
  const [mode, setMode] = useState<"lifetime" | "current">("lifetime")
  const { data, isLoading, isError } = useQuery({
    queryKey: ["statistics"],
    queryFn: async () => {
      const response = await fetch("/api/v1/users/me/statistics")
      if (!response.ok) throw new Error("Failed to load statistics")
      return (await response.json()) as StatisticsResponse
    },
  })

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-24 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (isError || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Статистика</CardTitle>
          <CardDescription>Не удалось загрузить статистику. Попробуйте обновить страницу.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const statistics = data[mode]
  const isLifetime = mode === "lifetime"
  const splitTotal = statistics.splits.equal + statistics.splits.exact + statistics.splits.percentage

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />
          Статистика
        </CardTitle>
        <CardDescription>
          История аккаунта и живой снимок существующих данных
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 rounded-lg bg-muted p-1" role="tablist" aria-label="Период статистики">
          <button
            type="button"
            role="tab"
            aria-selected={isLifetime}
            onClick={() => setMode("lifetime")}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isLifetime ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            За всё время
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isLifetime}
            onClick={() => setMode("current")}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              !isLifetime ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Сейчас
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatValue
            label="Участий в тратах"
            value={statistics.overview.expensesParticipated}
            icon={ReceiptText}
          />
          <StatValue
            label="Добавлено трат"
            value={statistics.overview.expensesCreated}
            icon={BarChart3}
          />
          <StatValue
            label="Оплачено трат"
            value={statistics.overview.expensesPaid}
            icon={Wallet}
          />
          <StatValue
            label={isLifetime ? "Максимум активных групп" : "Активных групп"}
            value={statistics.overview.activeGroups}
            icon={Users}
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <section className="space-y-3" aria-labelledby="statistics-splits">
            <div>
              <h3 id="statistics-splits" className="text-sm font-semibold">Способы деления</h3>
              <p className="text-xs text-muted-foreground">
                {isLifetime ? "Использовано за всё время" : "В существующих тратах"}
              </p>
            </div>
            <SplitRow label="Поровну" value={statistics.splits.equal} total={splitTotal} />
            <SplitRow label="По суммам" value={statistics.splits.exact} total={splitTotal} />
            <SplitRow label="По процентам" value={statistics.splits.percentage} total={splitTotal} />
          </section>

          <section aria-labelledby="statistics-collaboration">
            <h3 id="statistics-collaboration" className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Handshake className="h-4 w-4 text-primary" aria-hidden="true" />
              Вместе
            </h3>
            <DetailRow
              label={isLifetime ? "Людей за всё время" : "Людей в активных группах"}
              value={formatNumber(statistics.collaboration.uniquePeople)}
            />
            <DetailRow label="Зафиксировано расчётов" value={formatNumber(statistics.collaboration.settlementsSent)} />
            <DetailRow label="Получено расчётов" value={formatNumber(statistics.collaboration.settlementsReceived)} />
            <DetailRow label="Наличных расчётов" value={formatNumber(statistics.collaboration.cashSettlements)} />
            <DetailRow label="Создано приглашений" value={formatNumber(statistics.collaboration.invitesCreated)} />
            <DetailRow label="Трат занесено за других" value={formatNumber(statistics.collaboration.createdForOthers)} />
          </section>
        </div>

        <div className="grid gap-6 border-t pt-5 sm:grid-cols-2">
          <section aria-labelledby="statistics-groups">
            <h3 id="statistics-groups" className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-primary" aria-hidden="true" />
              Группы
            </h3>
            <DetailRow label={isLifetime ? "Создано вами за всё время" : "Создано и существует"} value={formatNumber(statistics.groups.created)} />
            <DetailRow label="Дом" value={formatNumber(statistics.groups.home)} />
            <DetailRow label="Поездки" value={formatNumber(statistics.groups.trip)} />
            <DetailRow label="Пары" value={formatNumber(statistics.groups.couple)} />
            <DetailRow label="Другие" value={formatNumber(statistics.groups.other)} />
          </section>

          <section aria-labelledby="statistics-records">
            <h3 id="statistics-records" className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
              Возможности и рекорды
            </h3>
            <DetailRow label="Использовано валют" value={formatNumber(statistics.mastery.currenciesUsed)} />
            <DetailRow label="Способов деления" value={`${statistics.mastery.splitMethodsUsed} из 3`} />
            <DetailRow label="Своих курсов указано" value={formatNumber(statistics.mastery.customRates)} />
            <DetailRow label="Максимум участников траты" value={formatNumber(statistics.records.maxExpenseParticipants)} />
            <DetailRow label="Самая большая группа" value={formatNumber(statistics.records.maxGroupMembers)} />
            <DetailRow label="Трат в самой активной группе" value={formatNumber(statistics.records.maxGroupExpenses)} />
            <DetailRow label="Дней с регистрации" value={formatNumber(statistics.records.accountAgeDays)} />
          </section>
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <Globe2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            {isLifetime
              ? "История сохраняется в аккаунте: удаление группы или траты не уменьшает эти показатели и личные рекорды."
              : "Этот раздел считается по существующим группам, тратам и расчётам, поэтому меняется после их редактирования или удаления."}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
