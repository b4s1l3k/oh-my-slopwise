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

type Member = { id: string; name: string; email: string; avatarUrl: string | null }

type Props = {
  groupId: string
  members: Member[]
  currency: string
  onSuccess: () => void
}

type SplitType = "EQUAL" | "EXACT" | "PERCENTAGE" | "SHARES"

export function ExpenseForm({ groupId, members, currency, onSuccess }: Props) {
  const { data: session } = useSession()
  const { toast } = useToast()
  const [title, setTitle] = useState("")
  const [amountStr, setAmountStr] = useState("")
  const [paidById, setPaidById] = useState(session?.user?.id ?? members[0]?.id ?? "")
  const [splitType, setSplitType] = useState<SplitType>("EQUAL")
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [notes, setNotes] = useState("")
  const [selectedIds, setSelectedIds] = useState<string[]>(members.map((m) => m.id))
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({})
  const [percentages, setPercentages] = useState<Record<string, string>>({})
  const [shares, setShares] = useState<Record<string, string>>(
    Object.fromEntries(members.map((m) => [m.id, "1"]))
  )

  useEffect(() => {
    if (session?.user?.id) setPaidById(session.user.id)
  }, [session])

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const amount = parseMoneyInput(amountStr)
      if (!amount) throw new Error("Укажите корректную сумму")
      if (!title.trim()) throw new Error("Укажите название")
      if (selectedIds.length === 0) throw new Error("Выберите хотя бы одного участника")

      const splits = buildSplits(splitType, selectedIds, amount, exactAmounts, percentages, shares)

      const res = await fetch(`/api/v1/groups/${groupId}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          amount,
          currency,
          paidById,
          splitType,
          date: new Date(date).toISOString(),
          notes: notes.trim() || undefined,
          splits,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        const msg =
          typeof data.error === "string"
            ? data.error
            : data.error?.formErrors?.[0] ??
              Object.values(data.error?.fieldErrors ?? {})[0]?.[0] ??
              "Ошибка создания расхода"
        throw new Error(msg)
      }
      return res.json()
    },
    onSuccess: onSuccess,
    onError: (e) => toast({ title: e instanceof Error ? e.message : "Ошибка", variant: "destructive" }),
  })

  const totalAmount = parseMoneyInput(amountStr)

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Название *</Label>
        <Input placeholder="Ужин в ресторане" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Сумма в рублях *</Label>
          <Input
            type="number"
            placeholder="1200"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            inputMode="decimal"
            min="0.01"
            step="0.01"
          />
        </div>
        <div className="space-y-2">
          <Label>Дата</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

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
                    ≈ {((totalAmount / selectedIds.length) / 100).toFixed(2)} {currency}
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

      <div className="space-y-2">
        <Label>Заметка (необязательно)</Label>
        <Input placeholder="..." value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <Button className="w-full" disabled={isPending} onClick={() => mutate()}>
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Добавить расход
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
