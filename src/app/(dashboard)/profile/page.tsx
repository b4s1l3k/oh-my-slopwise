"use client"
import { useState, useEffect } from "react"
import { useSession, signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { QueryErrorState } from "@/components/ui/query-error-state"
import { useToast } from "@/components/ui/toast"
import { AchievementsSection } from "@/components/profile/achievements-section"
import { StatisticsSection } from "@/components/profile/statistics-section"
import { Loader2, LogOut } from "lucide-react"
import { getApiErrorMessage } from "@/lib/api/client/api-error"
import { useProfileQuery, useUpdateProfileMutation } from "@/hooks/api/use-users"

export default function ProfilePage() {
  const { toast } = useToast()
  const { update: updateSession } = useSession()

  const [name, setName] = useState("")
  const [payeeName, setPayeeName] = useState("")
  const [bankName, setBankName] = useState("")
  const [payeeAccount, setPayeeAccount] = useState("")

  const { data, isLoading, isError, refetch } = useProfileQuery()

  useEffect(() => {
    if (data) {
      setName(data.name ?? "")
      setPayeeName(data.payeeName ?? "")
      setBankName(data.bankName ?? "")
      setPayeeAccount(data.payeeAccount ?? "")
    }
  }, [data])

  const save = useUpdateProfileMutation()

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="max-w-3xl mx-auto">
        <QueryErrorState
          title="Не удалось загрузить профиль"
          onRetry={() => void refetch()}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Профиль</h1>

      <StatisticsSection />

      <AchievementsSection />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Основное</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-name">Имя</Label>
            <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" value={data?.email ?? ""} disabled />
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
            <Label htmlFor="profile-payee-name">ФИО получателя</Label>
            <Input
              id="profile-payee-name"
              placeholder="Иван Иванов"
              value={payeeName}
              onChange={(e) => setPayeeName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-bank-name">Банк</Label>
            <Input
              id="profile-bank-name"
              placeholder="Тинькофф"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-payee-account">Номер карты / телефона</Label>
            <Input
              id="profile-payee-account"
              placeholder="+7 900 000-00-00 или 2200 0000 0000 0000"
              value={payeeAccount}
              onChange={(e) => setPayeeAccount(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Button
        className="w-full"
        onClick={() => save.mutate(
          { name, payeeName, bankName, payeeAccount },
          {
            onSuccess: async () => {
              await updateSession({ name })
              toast({ title: "Профиль сохранён" })
            },
            onError: (error) =>
              toast({
                title: getApiErrorMessage(error, "Не удалось сохранить"),
                variant: "destructive",
              }),
          }
        )}
        disabled={save.isPending}
      >
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
