"use client"
import { use, useState } from "react"
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
import { ArrowLeft, Plus, Trash2, ArrowRight, CheckCircle } from "lucide-react"
import Link from "next/link"
import { ExpenseForm } from "@/components/expenses/expense-form"
import { SettlementForm } from "@/components/balances/settlement-form"

type Member = { userId: string; user: { id: string; name: string; email: string; avatarUrl: string | null }; role: string }
type Expense = {
  id: string; title: string; amount: number; date: string; category?: string
  paidBy: { id: string; name: string }; splits: { user: { id: string; name: string }; amount: number }[]
}
type Debt = { fromUserId: string; fromUserName: string; toUserId: string; toUserName: string; amount: number }

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: groupId } = use(params)
  const { data: session } = useSession()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [settlementDebt, setSettlementDebt] = useState<Debt | null>(null)

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
        <Button onClick={() => setExpenseOpen(true)}>
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
            {group.members?.map((m: Member) => (
              <div key={m.userId} className="flex items-center gap-2 rounded-full border px-3 py-1">
                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                  {getInitials(m.user.name)}
                </div>
                <span className="text-sm">{m.user.name}</span>
                {m.role === "ADMIN" && <Badge variant="secondary" className="text-xs py-0">admin</Badge>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Балансы */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Долги в группе</CardTitle>
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
                    <span className="font-semibold text-sm">{formatMoney(debt.amount)}</span>
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
          Расходы ({expenses.length})
        </h2>
        {loadingExpenses ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : expenses.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-muted-foreground mb-4">Расходов пока нет</p>
              <Button onClick={() => setExpenseOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Добавить первый расход
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {expenses.map((expense) => {
              const myShare = expense.splits.find((s) => s.user.id === myUserId)?.amount
              const iMePaid = expense.paidBy.id === myUserId
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
                              ? `Вы заплатили ${formatMoney(expense.amount)}`
                              : `Ваша доля: ${formatMoney(myShare)}`}
                          </p>
                        )}
                      </div>
                      <div className="text-right flex items-start gap-2">
                        <div>
                          <p className="font-semibold">{formatMoney(expense.amount)}</p>
                          <p className="text-xs text-muted-foreground">
                            {expense.splits.length} чел.
                          </p>
                        </div>
                        {(expense.paidBy.id === myUserId || group.members?.find((m: Member) => m.userId === myUserId && m.role === "ADMIN")) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              if (confirm("Удалить расход?")) deleteExpense(expense.id)
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
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
