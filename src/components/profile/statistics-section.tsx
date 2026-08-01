"use client"

import { useQuery } from "@tanstack/react-query"
import {
  BarChart3,
  CalendarDays,
  Handshake,
  ReceiptText,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { MoneyTotal, ProfileStatistics } from "@/lib/statistics"
import { formatMoney } from "@/lib/utils/format"

type StatisticsResponse = {
  statistics: ProfileStatistics
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

function MoneyValue({ label, totals, icon: Icon }: {
  label: string
  totals: MoneyTotal[]
  icon: LucideIcon
}) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          {totals.length > 0 ? totals.map((total) => (
            <p key={total.currency} className="text-xl font-bold tabular-nums">
              {formatMoney(total.amount, total.currency)}
            </p>
          )) : (
            <p className="text-xl font-bold tabular-nums">0</p>
          )}
        </div>
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

  const statistics = data.statistics
  const splitTotal = statistics.splits.equal + statistics.splits.exact + statistics.splits.percentage

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />
          Статистика
        </CardTitle>
        <CardDescription>Ваши показатели за всё время</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
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
            label="Максимум активных групп"
            value={statistics.overview.activeGroups}
            icon={Users}
          />
        </div>

        <section className="space-y-3" aria-labelledby="statistics-money">
          <div>
            <h3 id="statistics-money" className="text-sm font-semibold">Деньги</h3>
            <p className="text-xs text-muted-foreground">Суммы в разных валютах показаны отдельно</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <MoneyValue label="Вы потратили" totals={statistics.money.spent} icon={Wallet} />
            <MoneyValue label="Вам вернули" totals={statistics.money.returned} icon={Handshake} />
          </div>
        </section>

        <div className="grid gap-6 sm:grid-cols-2">
          <section className="space-y-3" aria-labelledby="statistics-splits">
            <div>
              <h3 id="statistics-splits" className="text-sm font-semibold">Способы деления</h3>
              <p className="text-xs text-muted-foreground">Использовано за всё время</p>
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
            <DetailRow label="Людей за всё время" value={formatNumber(statistics.collaboration.uniquePeople)} />
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
            <DetailRow label="Создано вами за всё время" value={formatNumber(statistics.groups.created)} />
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

      </CardContent>
    </Card>
  )
}
