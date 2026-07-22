"use client"
import { use, useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useSession } from "next-auth/react"
import { formatMoney, formatDate, getInitials } from "@/lib/utils/format"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import { ArrowLeft, Plus, Trash2, ArrowRight, CheckCircle, Settings, Pencil, RefreshCw, Loader2, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { ExpenseForm } from "@/components/expenses/expense-form"
import { SettlementForm } from "@/components/balances/settlement-form"
import { RequisitesNudgeDialog } from "@/components/profile/requisites-nudge-dialog"

type Requisites = { payeeName: string | null; bankName: string | null; payeeAccount: string | null }
type Member = {
  userId: string
  role: string
  payeeName: string | null
  bankName: string | null
  payeeAccount: string | null
  user: {
    id: string; name: string; email: string; avatarUrl: string | null
    payeeName?: string | null; bankName?: string | null; payeeAccount?: string | null
  }
}
type Expense = {
  id: string; title: string; amount: number; currency: string; amountBase?: number | null
  customRate?: number | null
  date: string; category?: string; splitType: "EQUAL" | "EXACT" | "PERCENTAGE"
  notes?: string | null; paidById: string
  paidBy: { id: string; name: string }
  createdBy: { id: string; name: string }
  splits: { user: { id: string; name: string }; amount: number; share?: number | null; percentage?: number | null }[]
  // Расчёты наличными, сделанные в момент этой траты
  settlements?: { id: string; amount: number; currency: string; fromUser: { id: string; name: string } }[]
}
type Debt = { fromUserId: string; fromUserName: string; toUserId: string; toUserName: string; amount: number }

// Реквизиты поездки перекрывают профильные
function effectiveRequisites(members: Member[], userId: string): Requisites {
  const m = members.find((x) => x.userId === userId)
  return {
    payeeName: m?.payeeName ?? m?.user.payeeName ?? null,
    bankName: m?.bankName ?? m?.user.bankName ?? null,
    payeeAccount: m?.payeeAccount ?? m?.user.payeeAccount ?? null,
  }
}


// Пояснение к строке разбивки: процент или число долей (для EQUAL/EXACT — пусто)
function splitDetailLabel(
  splitType: Expense["splitType"],
  split: Expense["splits"][number]
): string {
  if (splitType === "PERCENTAGE" && split.percentage != null) {
    return `${split.percentage / 100}%`
  }
  return ""
}

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: groupId } = use(params)
  const { data: session } = useSession()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [editExpense, setEditExpense] = useState<Expense | null>(null)
  const [settlementDebt, setSettlementDebt] = useState<Debt | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [requisitesNudge, setRequisitesNudge] = useState(false)
  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const handleOpenExpense = () => {
    const profile = profileData?.user
    const hasRequisites = profile?.payeeName || profile?.bankName || profile?.payeeAccount
    if (!hasRequisites) {
      setRequisitesNudge(true)
    } else {
      setExpenseOpen(true)
    }
  }

  const { data: groupData, isLoading: loadingGroup } = useQuery({
    queryKey: ["group", groupId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/groups/${groupId}`)
      if (!res.ok) throw new Error("Not found")
      return res.json()
    },
  })

  const { data: expensesData, isLoading: loadingExpenses } = useQuery({
    queryKey: ["expenses", groupId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/groups/${groupId}/expenses`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const { data: balancesData, isLoading: loadingBalances } = useQuery({
    queryKey: ["balances", groupId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/groups/${groupId}/balances`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const { data: profileData } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const res = await fetch("/api/v1/users/me")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const { mutate: resetSettlements, isPending: resetting } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/groups/${groupId}/settlements`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error?.message ?? "Не удалось пересчитать")
      }
      return res.json()
    },
    onSuccess: (data: { removed: number }) => {
      qc.invalidateQueries({ queryKey: ["balances", groupId] })
      qc.invalidateQueries({ queryKey: ["overview"] })
      toast({
        title: data.removed > 0 ? `Расчёты сброшены (${data.removed})` : "Активных расчётов не было",
        description: "Долги пересчитаны по текущим тратам",
      })
    },
    onError: (e) =>
      toast({ title: e instanceof Error ? e.message : "Ошибка", variant: "destructive" }),
  })

  const { mutate: deleteExpense } = useMutation({
    mutationFn: async (expenseId: string) => {
      const res = await fetch(`/api/v1/expenses/${expenseId}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses", groupId] })
      qc.invalidateQueries({ queryKey: ["balances", groupId] })
      qc.invalidateQueries({ queryKey: ["overview"] })
      toast({ title: "Расход удалён" })
    },
    onError: () => toast({ title: "Ошибка удаления", variant: "destructive" }),
  })

  const group = groupData?.group
  const expenses: Expense[] = expensesData?.expenses ?? []
  const debts: Debt[] = balancesData?.balances?.simplified ?? []
  const myUserId = session?.user?.id
  const iAmAdmin = group?.members?.some(
    (m: Member) => m.userId === myUserId && m.role === "ADMIN"
  )
  // Редактировать: автор траты, плательщик или админ. Удалять: автор или админ.
  const canEdit = (e: Expense) =>
    e.createdBy?.id === myUserId || e.paidBy?.id === myUserId || iAmAdmin
  const canDelete = (e: Expense) => e.createdBy?.id === myUserId || iAmAdmin

  // Дефолтный курс каждого плательщика по каждой валюте (для подстановки в новую трату).
  // Учитываем ТОЛЬКО траты, которые плательщик внёс сам за себя (createdBy === paidBy):
  // курс, поставленный другим человеком за тебя, не должен менять твой дефолт.
  // Траты отсортированы по дате убыв. → первое вхождение = самое свежее.
  const rateBook = useMemo(() => {
    const book: Record<string, Record<string, number>> = {}
    for (const e of expenses) {
      if (e.customRate == null) continue
      if (e.createdBy?.id !== e.paidById) continue
      const perUser = (book[e.paidById] ??= {})
      if (!(e.currency in perUser)) perUser[e.currency] = e.customRate
    }
    return book
  }, [expenses])

  const filteredExpenses = useMemo(() => {
    if (!selectedMemberId) return expenses
    return expenses.filter(
      (e) =>
        e.paidBy.id === selectedMemberId ||
        e.splits.some((s) => s.user.id === selectedMemberId)
    )
  }, [expenses, selectedMemberId])

  if (loadingGroup) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!group) return <div className="text-center py-12 text-muted-foreground">Группа не найдена</div>

  const myDebts = debts.filter((d) => d.fromUserId === myUserId || d.toUserId === myUserId)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/groups">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{group.name}</h1>
          <p className="text-muted-foreground text-sm">
            {group.members?.length} участников
          </p>
        </div>
        <Link href={`/groups/${groupId}/settings`}>
          <Button variant="ghost" size="icon" title="Настройки группы">
            <Settings className="h-4 w-4" />
          </Button>
        </Link>
        <Button onClick={handleOpenExpense}>
          <Plus className="h-4 w-4 mr-2" />
          Расход
        </Button>
      </div>

      {/* Участники */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Участники</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {group.members?.map((m: Member) => {
              const active = selectedMemberId === m.userId
              return (
                <div
                  key={m.userId}
                  onClick={() => setSelectedMemberId(active ? null : m.userId)}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-3 py-1 cursor-pointer transition-colors select-none",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "border hover:bg-accent"
                  )}
                >
                  <div className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium",
                    active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/10 text-primary"
                  )}>
                    {getInitials(m.user.name)}
                  </div>
                  <span className="text-sm">{m.user.name}</span>
                  {m.role === "ADMIN" && (
                    <Badge
                      variant={active ? "outline" : "secondary"}
                      className="text-xs py-0"
                    >
                      admin
                    </Badge>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Балансы */}
      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Долги в группе</CardTitle>
          {iAmAdmin && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              disabled={resetting}
              onClick={() => {
                if (
                  confirm(
                    "Сбросить все зафиксированные расчёты этой поездки? Долги будут пересчитаны заново по текущим тратам. Отменить нельзя."
                  )
                )
                  resetSettlements()
              }}
              title="Удалить зафиксированные расчёты и пересчитать долги по текущим тратам"
            >
              {resetting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Пересчитать
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loadingBalances ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : debts.length === 0 ? (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span className="text-sm font-medium">Все расчёты завершены!</span>
            </div>
          ) : (
            <div className="space-y-2">
              {debts.map((debt, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{debt.fromUserName}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{debt.toUserName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{formatMoney(debt.amount, group.currency)}</span>
                    {debt.fromUserId === myUserId && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setSettlementDebt(debt)}
                      >
                        Оплатить
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Расходы */}
      <div>
        <h2 className="text-lg font-semibold mb-3">
          Расходы ({selectedMemberId ? `${filteredExpenses.length} из ${expenses.length}` : expenses.length})
        </h2>
        {loadingExpenses ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : expenses.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-muted-foreground mb-4">Расходов пока нет</p>
              <Button onClick={handleOpenExpense}>
                <Plus className="h-4 w-4 mr-2" />
                Добавить первый расход
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredExpenses.map((expense) => {
              const myShare = expense.splits.find((s) => s.user.id === myUserId)?.amount
              const iMePaid = expense.paidBy.id === myUserId
              const expanded = expandedIds.has(expense.id)
              // Наличные, отданные плательщику в момент траты, по каждому участнику
              const cashByUser: Record<string, number> = {}
              for (const s of expense.settlements ?? []) {
                cashByUser[s.fromUser.id] = (cashByUser[s.fromUser.id] ?? 0) + s.amount
              }
              const totalCash = Object.values(cashByUser).reduce((a, b) => a + b, 0)
              return (
                <Card key={expense.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{expense.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {expense.paidBy.name} · {formatDate(expense.date)}
                        </p>
                        {myShare !== undefined && (
                          <p className={`text-xs mt-1 font-medium ${iMePaid ? "text-green-600" : "text-destructive"}`}>
                            {iMePaid
                              ? `Вы заплатили ${formatMoney(expense.amount, expense.currency)}`
                              : `Ваша доля: ${formatMoney(myShare, expense.currency)}`}
                          </p>
                        )}
                      </div>
                      <div className="text-right flex items-start gap-2">
                        <div>
                          <p className="font-semibold">{formatMoney(expense.amount, expense.currency)}</p>
                          {expense.currency !== group.currency && expense.amountBase != null && (
                            <p className="text-xs text-muted-foreground">
                              ≈ {formatMoney(expense.amountBase, group.currency)}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {expense.splits.length} чел.
                          </p>
                          {totalCash > 0 && (
                            <p className="text-xs text-emerald-600 whitespace-nowrap">
                              {formatMoney(totalCash, expense.currency)} наличными
                            </p>
                          )}
                        </div>
                        {(canEdit(expense) || canDelete(expense)) && (
                          <div className="flex flex-col gap-1">
                            {canEdit(expense) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => setEditExpense(expense)}
                                title="Редактировать"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canDelete(expense) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => {
                                  if (confirm("Удалить расход?")) deleteExpense(expense.id)
                                }}
                                title="Удалить"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Кнопка «Подробнее» */}
                    <button
                      type="button"
                      onClick={() => toggleExpanded(expense.id)}
                      className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {expanded ? "Скрыть детали" : "Подробнее"}
                    </button>

                    {/* Разбивка по участникам */}
                    {expanded && (
                      <div className="mt-3 border-t pt-3 space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Заплатил <span className="font-medium text-foreground">{expense.paidBy.name}</span>
                          {" · "}
                          {formatMoney(expense.amount, expense.currency)}
                          {expense.currency !== group.currency && expense.amountBase != null && (
                            <> {" · "}≈ {formatMoney(expense.amountBase, group.currency)} {group.currency}</>
                          )}
                        </p>
                        {expense.currency !== group.currency &&
                          expense.amountBase != null &&
                          expense.amount > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Курс: 1 {expense.currency} ={" "}
                              {Number((expense.amountBase / expense.amount).toFixed(4))} {group.currency}
                              {" · "}
                              {expense.customRate != null ? "вручную" : "по курсу ЦБ"}
                            </p>
                          )}
                        <div className="space-y-1">
                          {expense.splits.map((s) => {
                            const isMe = s.user.id === myUserId
                            const isPayer = s.user.id === expense.paidBy.id
                            const cashPaid = cashByUser[s.user.id] ?? 0
                            // Остаток долга участника после наличных в моменте
                            const remaining = s.amount - cashPaid
                            return (
                              <div
                                key={s.user.id}
                                className="rounded-md px-2 py-1 odd:bg-muted/40"
                              >
                                <div className="flex items-center justify-between text-sm">
                                  <span className="flex items-center gap-1.5 min-w-0">
                                    <span className="truncate">{s.user.name}</span>
                                    {isMe && <Badge variant="secondary" className="text-[10px] py-0 px-1.5">вы</Badge>}
                                    {isPayer && (
                                      <span className="text-[10px] text-green-600 whitespace-nowrap">платил</span>
                                    )}
                                  </span>
                                  <span className="flex items-center gap-2 whitespace-nowrap">
                                    {splitDetailLabel(expense.splitType, s) && (
                                      <span className="text-xs text-muted-foreground">
                                        {splitDetailLabel(expense.splitType, s)}
                                      </span>
                                    )}
                                    <span className="font-medium">{formatMoney(s.amount, expense.currency)}</span>
                                  </span>
                                </div>
                                {cashPaid > 0 && !isPayer && (
                                  <div className="mt-0.5 flex items-center justify-between text-xs">
                                    <span className="text-emerald-600">
                                      ↳ отдал(а) наличными {formatMoney(cashPaid, expense.currency)} в моменте
                                    </span>
                                    <span className="text-muted-foreground whitespace-nowrap">
                                      осталось {formatMoney(remaining, expense.currency)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        {expense.notes && (
                          <p className="text-xs text-muted-foreground italic pt-1">{expense.notes}</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Диалог: добавить расход */}
      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Новый расход</DialogTitle>
          </DialogHeader>
          <ExpenseForm
            groupId={groupId}
            members={group.members?.map((m: Member) => m.user) ?? []}
            currency={group.currency}
            rateBook={rateBook}
            onSuccess={() => {
              setExpenseOpen(false)
              qc.invalidateQueries({ queryKey: ["expenses", groupId] })
              qc.invalidateQueries({ queryKey: ["balances", groupId] })
              qc.invalidateQueries({ queryKey: ["overview"] })
              toast({ title: "Расход добавлен" })
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Диалог: редактировать расход */}
      {editExpense && (
        <Dialog open onOpenChange={(o) => !o && setEditExpense(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Редактировать расход</DialogTitle>
            </DialogHeader>
            <ExpenseForm
              groupId={groupId}
              members={group.members?.map((m: Member) => m.user) ?? []}
              currency={group.currency}
              expense={{
                id: editExpense.id,
                title: editExpense.title,
                amount: editExpense.amount,
                currency: editExpense.currency,
                customRate: editExpense.customRate,
                splitType: editExpense.splitType,
                date: editExpense.date,
                notes: editExpense.notes,
                paidById: editExpense.paidById,
                splits: editExpense.splits.map((s) => ({
                  userId: s.user.id,
                  amount: s.amount,
                  share: s.share,
                  percentage: s.percentage,
                })),
              }}
              onSuccess={() => {
                setEditExpense(null)
                qc.invalidateQueries({ queryKey: ["expenses", groupId] })
                qc.invalidateQueries({ queryKey: ["balances", groupId] })
                qc.invalidateQueries({ queryKey: ["overview"] })
                toast({ title: "Расход обновлён" })
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Диалог: реквизиты перед тратой */}
      <RequisitesNudgeDialog
        open={requisitesNudge}
        groupId={groupId}
        onClose={() => {
          setRequisitesNudge(false)
          setExpenseOpen(true)
        }}
      />

      {/* Диалог: расчёт */}
      {settlementDebt && (
        <Dialog open onOpenChange={() => setSettlementDebt(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Рассчитаться с {settlementDebt.toUserName}</DialogTitle>
            </DialogHeader>
            <SettlementForm
              groupId={groupId}
              toUserId={settlementDebt.toUserId}
              toUserName={settlementDebt.toUserName}
              suggestedAmount={settlementDebt.amount}
              currency={group.currency}
              payeeRequisites={effectiveRequisites(group.members, settlementDebt.toUserId)}
              onSuccess={() => {
                setSettlementDebt(null)
                qc.invalidateQueries({ queryKey: ["balances", groupId] })
                qc.invalidateQueries({ queryKey: ["overview"] })
                toast({ title: `Расчёт с ${settlementDebt.toUserName} зафиксирован` })
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
