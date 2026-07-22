"use client"
import { useState, useEffect } from "react"
import { useSession, signOut } from "next-auth/react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { Loader2, LogOut } from "lucide-react"

type Profile = {
  name: string
  email: string
  payeeName: string | null
  bankName: string | null
  payeeAccount: string | null
}

export default function ProfilePage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { update: updateSession } = useSession()

  const [name, setName] = useState("")
  const [payeeName, setPayeeName] = useState("")
  const [bankName, setBankName] = useState("")
  const [payeeAccount, setPayeeAccount] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const res = await fetch("/api/v1/users/me")
      if (!res.ok) throw new Error("Failed")
      const json = await res.json()
      return json.user as Profile
    },
  })

  useEffect(() => {
    if (data) {
      setName(data.name ?? "")
      setPayeeName(data.payeeName ?? "")
      setBankName(data.bankName ?? "")
      setPayeeAccount(data.payeeAccount ?? "")
    }
  }, [data])

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, payeeName, bankName, payeeAccount }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: { fieldErrors?: Record<string, string[]> }
        }
        throw new Error(data.error?.fieldErrors?.name?.[0] ?? "Не удалось сохранить")
      }
    },
    onSuccess: async () => {
      // Освежаем имя в сессии (приветствие в шапке) и данные групп, где оно показано
      await updateSession({ name })
      qc.invalidateQueries({ queryKey: ["profile"] })
      qc.invalidateQueries({ queryKey: ["group"] })
      qc.invalidateQueries({ queryKey: ["groups"] })
      qc.invalidateQueries({ queryKey: ["expenses"] })
      qc.invalidateQueries({ queryKey: ["balances"] })
      qc.invalidateQueries({ queryKey: ["overview"] })
      toast({ title: "Профиль сохранён" })
    },
    onError: (e) => toast({ title: e.message, variant: "destructive" }),
  })

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-lg mx-auto">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold">Профиль</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Основное</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Имя</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={data?.email ?? ""} disabled />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Реквизиты по умолчанию</CardTitle>
          <CardDescription>
            Их увидят те, кто должен вам перевести деньги. Можно переопределить в конкретной поездке.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>ФИО получателя</Label>
            <Input
              placeholder="Иван Иванов"
              value={payeeName}
              onChange={(e) => setPayeeName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Банк</Label>
            <Input
              placeholder="Тинькофф"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Номер карты / телефона</Label>
            <Input
              placeholder="+7 900 000-00-00 или 2200 0000 0000 0000"
              value={payeeAccount}
              onChange={(e) => setPayeeAccount(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Сохранить
      </Button>

      <Button
        variant="outline"
        className="w-full text-muted-foreground"
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        <LogOut className="mr-2 h-4 w-4" />
        Выйти из аккаунта
      </Button>
    </div>
  )
}
