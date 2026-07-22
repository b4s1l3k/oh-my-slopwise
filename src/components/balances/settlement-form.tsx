"use client"
import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { parseMoneyInput, formatMoney } from "@/lib/utils/format"
import { useToast } from "@/components/ui/toast"

type Requisites = {
  payeeName: string | null
  bankName: string | null
  payeeAccount: string | null
}

type Props = {
  groupId: string
  toUserId: string
  toUserName: string
  suggestedAmount: number
  currency?: string
  payeeRequisites?: Requisites
  onSuccess: () => void
}

export function SettlementForm({
  groupId,
  toUserId,
  toUserName,
  suggestedAmount,
  currency = "RUB",
  payeeRequisites,
  onSuccess,
}: Props) {
  const { toast } = useToast()
  const [amountStr, setAmountStr] = useState((suggestedAmount / 100).toFixed(2))
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [notes, setNotes] = useState("")

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const amount = parseMoneyInput(amountStr)
      if (!amount) throw new Error("Укажите сумму")

      const res = await fetch("/api/v1/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId,
          toUserId,
          amount,
          currency,
          date: new Date(date).toISOString(),
          notes: notes.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string | { message?: string } }
          | null
        const msg =
          typeof data?.error === "string"
            ? data.error
            : data?.error?.message ?? "Не удалось зафиксировать расчёт"
        throw new Error(msg)
      }
      return res.json()
    },
    onSuccess: onSuccess,
    onError: (e) => toast({ title: e instanceof Error ? e.message : "Ошибка", variant: "destructive" }),
  })

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-muted p-3 text-sm">
        Вы отметите, что перевели{" "}
        <span className="font-semibold">{toUserName}</span> деньги.
        Рекомендуемая сумма:{" "}
        <span className="font-semibold text-primary">{formatMoney(suggestedAmount, currency)}</span>
      </div>

      {payeeRequisites &&
        (payeeRequisites.payeeAccount || payeeRequisites.payeeName || payeeRequisites.bankName) && (
          <div className="rounded-lg border p-3 text-sm space-y-1">
            <p className="font-medium">Реквизиты для перевода:</p>
            {payeeRequisites.payeeName && (
              <p className="text-muted-foreground">ФИО: {payeeRequisites.payeeName}</p>
            )}
            {payeeRequisites.bankName && (
              <p className="text-muted-foreground">Банк: {payeeRequisites.bankName}</p>
            )}
            {payeeRequisites.payeeAccount && (
              <p className="font-mono">{payeeRequisites.payeeAccount}</p>
            )}
          </div>
        )}

      <div className="space-y-2">
        <Label>Сумма</Label>
        <Input
          type="number"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          inputMode="decimal"
        />
      </div>

      <div className="space-y-2">
        <Label>Дата</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>Заметка (необязательно)</Label>
        <Input
          placeholder="Перевод через Тинькофф..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <Button className="w-full" onClick={() => mutate()} disabled={isPending}>
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Зафиксировать расчёт
      </Button>
    </div>
  )
}
