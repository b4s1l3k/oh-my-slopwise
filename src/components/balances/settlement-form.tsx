"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { parseMoneyInput, formatMoney, toCalendarDateInputValue } from "@/lib/utils/format"
import { useToast } from "@/components/ui/toast"
import { getApiErrorMessage } from "@/lib/api/client/api-error"
import { useCreateSettlement } from "@/hooks/api/use-settlements"
import type { RequisitesViewModel } from "@/lib/api/view-models/models"

type Props = {
  groupId: string
  toUserId: string
  toUserName: string
  suggestedAmount: number
  currency?: string
  payeeRequisites?: RequisitesViewModel
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
  const [date, setDate] = useState(toCalendarDateInputValue())
  const [notes, setNotes] = useState("")

  const settlement = useCreateSettlement()

  const submit = () => {
    const amount = parseMoneyInput(amountStr)
    if (!amount) {
      toast({ title: "Укажите сумму", variant: "destructive" })
      return
    }

    settlement.mutate(
      {
        groupId,
        toUserId,
        amount,
        currency,
        date,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess,
        onError: (error) =>
          toast({
            title: getApiErrorMessage(error, "Не удалось зафиксировать расчёт"),
            variant: "destructive",
          }),
      }
    )
  }

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
        <Label htmlFor="settlement-amount">Сумма</Label>
        <Input
          id="settlement-amount"
          type="number"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          inputMode="decimal"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="settlement-date">Дата</Label>
        <Input
          id="settlement-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="settlement-notes">Заметка (необязательно)</Label>
        <Input
          id="settlement-notes"
          placeholder="Перевод через Тинькофф..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <Button className="w-full" onClick={submit} disabled={settlement.isPending}>
        {settlement.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Зафиксировать расчёт
      </Button>
    </div>
  )
}
