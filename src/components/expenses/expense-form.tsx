"use client"
import { useState, useEffect } from "react"
import { useMutation } from "@tanstack/react-query"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import { parseMoneyInput } from "@/lib/utils/format"
import { useToast } from "@/components/ui/toast"
import { CURRENCY_META, isSupportedCurrency } from "@/lib/currencies"

type Member = { id: string; name: string; email: string; avatarUrl: string | null }
type SplitType = "EQUAL" | "EXACT" | "PERCENTAGE" | "SHARES"

// Данные для режима редактирования
export type EditableExpense = {
  id: string
  title: string
  amount: number
  currency: string
  customRate?: number | null
  splitType: SplitType
  date: string
  notes?: string | null
  paidById: string
  splits: { userId: string; amount: number; share?: number | null; percentage?: number | null }[]
}

type Props = {
  groupId: string
  members: Member[]
  currency: string
  expense?: EditableExpense // если передан — режим редактирования
  // Последний ручной курс каждого плательщика по валютам: rateBook[userId][currency]
  rateBook?: Record<string, Record<string, number>>
  onSuccess: (paidById: string) => void
}

export function ExpenseForm({ groupId, members, currency, expense, rateBook, onSuccess }: Props) {
  const { data: session } = useSession()
  const { toast } = useToast()
  const isEdit = !!expense

  const [title, setTitle] = useState(expense?.title ?? "")
  const [amountStr, setAmountStr] = useState(expense ? String(expense.amount / 100) : "")
  const [expenseCurrency, setExpenseCurrency] = useState(expense?.currency ?? currency)
  const [rateStr, setRateStr] = useState(
    expense?.customRate != null ? String(expense.customRate) : ""
  )
  const [paidById, setPaidById] = useState(
    expense?.paidById ?? session?.user?.id ?? members[0]?.id ?? ""
  )
  const [splitType, setSplitType] = useState<SplitType>(expense?.splitType ?? "EQUAL")
  const [date, setDate] = useState(
    (expense?.date ?? new Date().toISOString()).split("T")[0]
  )
  const [notes, setNotes] = useState(expense?.notes ?? "")
  const [selectedIds, setSelectedIds] = useState<string[]>(
    expense ? expense.splits.map((s) => s.userId) : members.map((m) => m.id)
  )
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>(
    expense
      ? Object.fromEntries(expense.splits.map((s) => [s.userId, String(s.amount / 100)]))
      : {}
  )
  const [percentages, setPercentages] = useState<Record<string, string>>(
    expense
      ? Object.fromEntries(
          expense.splits.map((s) => [s.userId, s.percentage ? String(s.percentage / 100) : ""])
        )
      : {}
  )
  const [cashPayments, setCashPayments] = useState<Record<string, string>>({})
  const [showCashSection, setShowCashSection] = useState(false)

  const [shares, setShares] = useState<Record<string, string>>(
    expense
      ? Object.fromEntries(expense.splits.map((s) => [s.userId, String(s.share ?? 1)]))
      : Object.fromEntries(members.map((m) => [m.id, "1"]))
  )

  useEffect(() => {
    // автоподстановка плательщика только при создании
    if (!isEdit && session?.user?.id) setPaidById(session.user.id)
  }, [session, isEdit])

  // При создании: подставляем последний курс плательщика для выбранной валюты.
  // Срабатывает при смене плательщика или валюты (в режиме правки не трогаем).
  const rememberedRate =
    expenseCurrency !== currency ? rateBook?.[paidById]?.[expenseCurrency] : undefined
  useEffect(() => {
    if (isEdit) return
    setRateStr(rememberedRate != null ? String(rememberedRate) : "")
  }, [isEdit, paidById, expenseCurrency, rememberedRate])

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const amount = parseMoneyInput(amountStr)
      if (!amount) throw new Error("Укажите корректную сумму")
      if (!title.trim()) throw new Error("Укажите название")
      if (selectedIds.length === 0) throw new Error("Выберите хотя бы одного участника")

      const splits = buildSplits(splitType, selectedIds, amount, exactAmounts, percentages, shares)

      // Ручной курс учитываем только если валюта траты ≠ валюте расчёта.
      const parsedRate = parseFloat(rateStr.replace(",", "."))
      const customRate =
        expenseCurrency !== currency && rateStr.trim() && parsedRate > 0 ? parsedRate : undefined

      // Наличные платежи на месте (только при создании, не пустые, не плательщик)
      const cashPaymentsList = !isEdit && showCashSection
        ? Object.entries(cashPayments)
            .filter(([id]) => id !== paidById && selectedIds.includes(id))
            .flatMap(([userId, str]) => {
              const a = parseMoneyInput(str)
              return a > 0 ? [{ userId, amount: a }] : []
            })
        : []

      const url = isEdit ? `/api/v1/expenses/${expense!.id}` : `/api/v1/groups/${groupId}/expenses`
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          amount,
          currency: expenseCurrency,
          customRate,
          paidById,
          splitType,
          date: new Date(date).toISOString(),
          notes: notes.trim() || undefined,
          splits,
          ...(cashPaymentsList.length > 0 ? { cashPayments: cashPaymentsList } : {}),
        }),
      })
      if (!res.ok) {
        const data = (await res.json()) as {
          error?: string | { formErrors?: string[]; fieldErrors?: Record<string, string[]> }
        }
        const msg =
          typeof data.error === "string"
            ? data.error
            : data.error?.formErrors?.[0] ??
              Object.values(data.error?.fieldErrors ?? {})[0]?.[0] ??
              (isEdit ? "Ошибка сохранения" : "Ошибка создания расхода")
        throw new Error(msg)
      }
      return res.json()
    },
    onSuccess: () => onSuccess(paidById),
    onError: (e) => toast({ title: e instanceof Error ? e.message : "Ошибка", variant: "destructive" }),
  })

  const totalAmount = parseMoneyInput(amountStr)
  const expCur = isSupportedCurrency(expenseCurrency) ? expenseCurrency : "RUB"
  const expSymbol = CURRENCY_META[expCur].symbol
  const settlementSymbol = isSupportedCurrency(currency) ? CURRENCY_META[currency].symbol : currency
  const differentCurrency = expenseCurrency !== currency
  const rateNum = parseFloat(rateStr.replace(",", "."))
  const rateValid = rateStr.trim() !== "" && rateNum > 0
  const payerName = members.find((m) => m.id === paidById)?.name ?? ""
  const rateFromMemory = !isEdit && rememberedRate != null && rateValid && rateNum === rememberedRate

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Название *</Label>
        <Input placeholder="Ужин в ресторане" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Сумма траты *</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="1200"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              inputMode="decimal"
              min="0.01"
              step="0.01"
              className="flex-1"
            />
            <Select value={expenseCurrency} onValueChange={setExpenseCurrency}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="RUB">₽ RUB</SelectItem>
                <SelectItem value="USD">$ USD</SelectItem>
                <SelectItem value="EUR">€ EUR</SelectItem>
                <SelectItem value="AMD">֏ AMD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Дата</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {/* Ручной курс — только если валюта траты ≠ валюте расчёта */}
      {differentCurrency && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <Label className="flex items-baseline gap-2">
            Курс
            <span className="text-xs font-normal text-muted-foreground">необязательно</span>
          </Label>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground whitespace-nowrap">1 {expSymbol} =</span>
            <Input
              type="number"
              placeholder="по курсу ЦБ"
              value={rateStr}
              onChange={(e) => setRateStr(e.target.value)}
              inputMode="decimal"
              min="0"
              step="0.0001"
              className="w-32 h-8"
            />
            <span className="text-muted-foreground whitespace-nowrap">{settlementSymbol}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {rateValid && totalAmount > 0
              ? `≈ ${((totalAmount * rateNum) / 100).toFixed(2)} ${settlementSymbol} в валюте расчёта`
              : "Если оставить пустым — пересчёт по курсу ЦБ на дату траты"}
          </p>
          {rateFromMemory && (
            <p className="text-xs text-muted-foreground">
              ↩ Подставлен последний курс{payerName ? ` (${payerName})` : ""} — можно изменить
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label>Кто заплатил</Label>
        <Select value={paidById} onValueChange={setPaidById}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Способ разбивки</Label>
        <div className="grid grid-cols-4 gap-1">
          {(["EQUAL", "EXACT", "PERCENTAGE", "SHARES"] as SplitType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setSplitType(t)}
              className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                splitType === t ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
              }`}
            >
              {splitTypeLabel(t)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Участники разбивки</Label>
        <div className="space-y-2">
          {members.map((m) => {
            const selected = selectedIds.includes(m.id)
            return (
              <div key={m.id} className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedIds((prev) =>
                      prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                    )
                  }}
                  className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    selected ? "bg-primary border-primary" : "border-input"
                  }`}
                >
                  {selected && <span className="text-primary-foreground text-xs">✓</span>}
                </button>
                <span className="text-sm flex-1">{m.name}</span>

                {selected && splitType === "EQUAL" && totalAmount > 0 && (
                  <span className="text-sm text-muted-foreground">
                    ≈ {((totalAmount / selectedIds.length) / 100).toFixed(2)} {expSymbol}
                  </span>
                )}
                {selected && splitType === "EXACT" && (
                  <Input
                    type="number"
                    className="w-28 h-8 text-sm"
                    placeholder="0.00"
                    value={exactAmounts[m.id] ?? ""}
                    onChange={(e) => setExactAmounts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                    inputMode="decimal"
                  />
                )}
                {selected && splitType === "PERCENTAGE" && (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      className="w-20 h-8 text-sm"
                      placeholder="0"
                      value={percentages[m.id] ?? ""}
                      onChange={(e) => setPercentages((prev) => ({ ...prev, [m.id]: e.target.value }))}
                      inputMode="decimal"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                )}
                {selected && splitType === "SHARES" && (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      className="w-20 h-8 text-sm"
                      placeholder="1"
                      value={shares[m.id] ?? "1"}
                      onChange={(e) => setShares((prev) => ({ ...prev, [m.id]: e.target.value }))}
                      inputMode="numeric"
                      min="1"
                    />
                    <span className="text-sm text-muted-foreground">доля</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Наличный расчёт на месте — только при создании */}
      {!isEdit && selectedIds.some((id) => id !== paidById) && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowCashSection((v) => !v)}
            className="flex w-full items-center justify-between text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>Уже заплатили наличными</span>
            <span className="text-xs">{showCashSection ? "▲" : "▼"}</span>
          </button>
          {showCashSection && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Кто-то сразу вернул наличными — укажи сумму, и долг сразу уменьшится
              </p>
              {selectedIds
                .filter((id) => id !== paidById)
                .map((id) => {
                  const m = members.find((mem) => mem.id === id)
                  if (!m) return null
                  return (
                    <div key={id} className="flex items-center gap-2">
                      <span className="text-sm flex-1 truncate">{m.name}</span>
                      <Input
                        type="number"
                        className="w-28 h-8 text-sm"
                        placeholder="0.00"
                        value={cashPayments[id] ?? ""}
                        onChange={(e) =>
                          setCashPayments((prev) => ({ ...prev, [id]: e.target.value }))
                        }
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                      />
                      <span className="text-sm text-muted-foreground w-8">{expSymbol}</span>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label>Заметка (необязательно)</Label>
        <Input placeholder="..." value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <Button className="w-full" disabled={isPending} onClick={() => mutate()}>
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isEdit ? "Сохранить изменения" : "Добавить расход"}
      </Button>
    </div>
  )
}

function splitTypeLabel(t: SplitType) {
  return { EQUAL: "Поровну", EXACT: "Суммы", PERCENTAGE: "Проценты", SHARES: "Доли" }[t]
}

function buildSplits(
  type: SplitType,
  ids: string[],
  totalAmount: number,
  exact: Record<string, string>,
  pct: Record<string, string>,
  sh: Record<string, string>
) {
  switch (type) {
    case "EQUAL":
      return ids.map((id) => ({ userId: id }))
    case "EXACT":
      return ids.map((id) => ({ userId: id, amount: parseMoneyInput(exact[id] ?? "0") }))
    case "PERCENTAGE":
      return ids.map((id) => ({
        userId: id,
        percentage: Math.round(parseFloat(pct[id] ?? "0") * 100),
      }))
    case "SHARES":
      return ids.map((id) => ({ userId: id, shares: parseInt(sh[id] ?? "1") || 1 }))
  }
}
