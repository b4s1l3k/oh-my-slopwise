"use client"
import { use, useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { getInitials } from "@/lib/utils/format"
import { ArrowLeft, Search, Trash2, LogOut, Loader2, X } from "lucide-react"

type Member = {
  userId: string
  role: string
  payeeName: string | null
  bankName: string | null
  payeeAccount: string | null
  user: { id: string; name: string; email: string; avatarUrl: string | null }
}
type UserResult = { id: string; name: string; avatarUrl: string | null }

async function apiError(res: Response, fallback: string) {
  try {
    const data = await res.json()
    return data?.error?.message ?? fallback
  } catch {
    return fallback
  }
}

export default function GroupSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: groupId } = use(params)
  const router = useRouter()
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data: session } = useSession()
  const myId = session?.user?.id

  const [name, setName] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<UserResult[]>([])
  const [reqName, setReqName] = useState("")
  const [reqBank, setReqBank] = useState("")
  const [reqAccount, setReqAccount] = useState("")
  const [inviteUrl, setInviteUrl] = useState("")
  const initialised = useRef(false)

  const { data, isLoading } = useQuery({
    queryKey: ["group", groupId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/groups/${groupId}`)
      if (!res.ok) throw new Error("Not found")
      return res.json()
    },
  })

  useEffect(() => {
    if (!data || !myId || initialised.current) return
    setName(data.group.name)
    const me = data.group.members.find((m: Member) => m.userId === myId)
    if (me) {
      setReqName(me.payeeName ?? "")
      setReqBank(me.bankName ?? "")
      setReqAccount(me.payeeAccount ?? "")
    }
    initialised.current = true
  }, [data, myId])

  const group = data?.group
  const members: Member[] = group?.members ?? []
  const isAdmin = members.find((m) => m.userId === myId)?.role === "ADMIN"

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["group", groupId] })
    qc.invalidateQueries({ queryKey: ["groups"] })
    qc.invalidateQueries({ queryKey: ["balances", groupId] })
  }

  const rename = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error(await apiError(res, "Не удалось переименовать"))
    },
    onSuccess: () => {
      invalidate()
      toast({ title: "Название обновлено" })
    },
    onError: (e) => toast({ title: e.message, variant: "destructive" }),
  })

  const saveRequisites = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/groups/${groupId}/requisites`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payeeName: reqName, bankName: reqBank, payeeAccount: reqAccount }),
      })
      if (!res.ok) throw new Error(await apiError(res, "Не удалось сохранить реквизиты"))
    },
    onSuccess: () => {
      invalidate()
      toast({ title: "Реквизиты для поездки сохранены" })
    },
    onError: (e) => toast({ title: e.message, variant: "destructive" }),
  })

  const createInvite = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/groups/${groupId}/invite`, { method: "POST" })
      if (!res.ok) throw new Error(await apiError(res, "Не удалось создать ссылку"))
      const json = await res.json()
      return `${window.location.origin}/invite/${json.token}`
    },
    onSuccess: (url) => setInviteUrl(url),
    onError: (e) => toast({ title: e.message, variant: "destructive" }),
  })

  const revokeInvite = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/groups/${groupId}/invite`, { method: "DELETE" })
      if (!res.ok) throw new Error(await apiError(res, "Не удалось отозвать"))
    },
    onSuccess: () => {
      setInviteUrl("")
      toast({ title: "Ссылка отозвана" })
    },
    onError: (e) => toast({ title: e.message, variant: "destructive" }),
  })

  const addMember = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/v1/groups/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) throw new Error(await apiError(res, "Не удалось добавить"))
    },
    onSuccess: () => {
      invalidate()
      setSearchQuery("")
      setSearchResults([])
      toast({ title: "Участник добавлен" })
    },
    onError: (e) => toast({ title: e.message, variant: "destructive" }),
  })

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/v1/groups/${groupId}/members?userId=${userId}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error(await apiError(res, "Не удалось удалить"))
    },
    onSuccess: () => {
      invalidate()
      toast({ title: "Участник удалён" })
    },
    onError: (e) => toast({ title: e.message, variant: "destructive" }),
  })

  const leave = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/groups/${groupId}/members?userId=${myId}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error(await apiError(res, "Не удалось выйти"))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["groups"] })
      toast({ title: "Вы вышли из группы" })
      router.push("/groups")
    },
    onError: (e) => toast({ title: e.message, variant: "destructive" }),
  })

  const deleteGroup = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/groups/${groupId}`, { method: "DELETE" })
      if (!res.ok) throw new Error(await apiError(res, "Не удалось удалить группу"))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["groups"] })
      toast({ title: "Группа удалена" })
      router.push("/groups")
    },
    onError: (e) => toast({ title: e.message, variant: "destructive" }),
  })

  async function searchUsers(q: string) {
    if (q.length < 2) {
      setSearchResults([])
      return
    }
    const res = await fetch(`/api/v1/users/search?q=${encodeURIComponent(q)}`)
    const json = await res.json()
    setSearchResults(
      (json.users ?? []).filter((u: UserResult) => !members.some((m) => m.userId === u.id))
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!group) {
    return <div className="text-center py-12 text-muted-foreground">Группа не найдена</div>
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <Link href={`/groups/${groupId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Настройки группы</h1>
      </div>

      {/* Название — только для админа */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Название</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            <Button
              size="sm"
              disabled={!name.trim() || name === group.name || rename.isPending}
              onClick={() => rename.mutate()}
            >
              {rename.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Сохранить
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Участники */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Участники ({members.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isAdmin && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Добавить по имени..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  searchUsers(e.target.value)
                }}
              />
              {searchResults.length > 0 && (
                <div className="mt-2 border rounded-md divide-y">
                  {searchResults.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent text-left"
                      onClick={() => addMember.mutate(u.id)}
                    >
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                        {getInitials(u.name)}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{u.name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            {members.map((m) => (
              <div
                key={m.userId}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                    {getInitials(m.user.name)}
                  </div>
                  <span className="text-sm">
                    {m.user.name}
                    {m.userId === myId && " (вы)"}
                  </span>
                  {m.role === "ADMIN" && (
                    <Badge variant="secondary" className="text-xs py-0">
                      admin
                    </Badge>
                  )}
                </div>
                {isAdmin && m.userId !== myId && (
                  <button
                    type="button"
                    onClick={() => removeMember.mutate(m.userId)}
                    className="text-muted-foreground hover:text-destructive"
                    title="Удалить участника"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Приглашение по ссылке */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Пригласить по ссылке</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            По ссылке может вступить несколько человек.
            {isAdmin && " Отзыв делает старую ссылку недействительной."}
          </p>
          {inviteUrl ? (
            <>
              <div className="flex gap-2">
                <Input readOnly value={inviteUrl} onFocus={(e) => e.currentTarget.select()} />
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard?.writeText(inviteUrl)
                    toast({ title: "Ссылка скопирована" })
                  }}
                >
                  Копировать
                </Button>
              </div>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => revokeInvite.mutate()}
                  disabled={revokeInvite.isPending}
                >
                  Отозвать ссылку
                </Button>
              )}
            </>
          ) : (
            <Button size="sm" onClick={() => createInvite.mutate()} disabled={createInvite.isPending}>
              {createInvite.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Создать ссылку
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Реквизиты для этой группы */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Мои реквизиты в этой группе</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Только для этой группы — не влияют на реквизиты в профиле.
            Если оставить пустым, участники увидят реквизиты из вашего профиля.
          </p>
          <div className="space-y-2">
            <Label>ФИО получателя</Label>
            <Input value={reqName} onChange={(e) => setReqName(e.target.value)} placeholder="как в профиле" />
          </div>
          <div className="space-y-2">
            <Label>Банк</Label>
            <Input value={reqBank} onChange={(e) => setReqBank(e.target.value)} placeholder="как в профиле" />
          </div>
          <div className="space-y-2">
            <Label>Номер карты / телефона</Label>
            <Input value={reqAccount} onChange={(e) => setReqAccount(e.target.value)} placeholder="как в профиле" />
          </div>
          <Button size="sm" onClick={() => saveRequisites.mutate()} disabled={saveRequisites.isPending}>
            {saveRequisites.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Сохранить реквизиты
          </Button>
        </CardContent>
      </Card>

      {/* Опасная зона */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Действия</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            className="w-full justify-start"
            disabled={leave.isPending}
            onClick={() => {
              if (confirm("Выйти из группы? Это возможно только при нулевом балансе.")) {
                leave.mutate()
              }
            }}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Выйти из группы
          </Button>

          {isAdmin && (
            <Button
              variant="destructive"
              className="w-full justify-start"
              disabled={deleteGroup.isPending}
              onClick={() => {
                if (confirm("Удалить группу со всеми расходами? Действие необратимо.")) {
                  deleteGroup.mutate()
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Удалить группу
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
