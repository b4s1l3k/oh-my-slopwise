"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, ArrowLeft, Search, X } from "lucide-react"
import Link from "next/link"
import { getInitials } from "@/lib/utils/format"

type UserResult = { id: string; name: string; email: string; avatarUrl: string | null }

export default function NewGroupPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const { toast } = useToast()

  const [name, setName] = useState("")
  const [type, setType] = useState("OTHER")
  const [currency, setCurrency] = useState("RUB")
  const [members, setMembers] = useState<UserResult[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<UserResult[]>([])
  const [searching, setSearching] = useState(false)

  async function searchUsers(q: string) {
    if (q.length < 2) { setSearchResults([]); return }
    setSearching(true)
    const res = await fetch(`/api/v1/users/search?q=${encodeURIComponent(q)}`)
    const data = await res.json()
    setSearchResults(data.users?.filter((u: UserResult) => !members.find((m) => m.id === u.id)) ?? [])
    setSearching(false)
  }

  const { mutate: createGroup, isPending } = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, currency, memberIds: members.map((m) => m.id) }),
      })
      if (!res.ok) throw new Error("Ошибка создания группы")
      return res.json()
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["groups"] })
      toast({ title: `Группа "${name}" создана` })
      router.push(`/groups/${data.group.id}`)
    },
    onError: () => toast({ title: "Ошибка создания группы", variant: "destructive" }),
  })

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/groups">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Новая группа</h1>
      </div>

      <Card>
        <CardHeader><CardTitle>Информация о группе</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Название *</Label>
            <Input
              id="name"
              placeholder="Квартира на Тверской"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Тип</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="HOME">🏠 Дом</SelectItem>
                  <SelectItem value="TRIP">✈️ Поездка</SelectItem>
                  <SelectItem value="COUPLE">💑 Пара</SelectItem>
                  <SelectItem value="OTHER">📦 Другое</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Валюта</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RUB">₽ Рубль</SelectItem>
                  <SelectItem value="USD">$ Доллар</SelectItem>
                  <SelectItem value="EUR">€ Евро</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Участники</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Найти по email или имени..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                searchUsers(e.target.value)
              }}
            />
          </div>

          {searchResults.length > 0 && (
            <div className="border rounded-md divide-y">
              {searchResults.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent text-left"
                  onClick={() => {
                    setMembers((prev) => [...prev, user])
                    setSearchResults([])
                    setSearchQuery("")
                  }}
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                    {getInitials(user.name)}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {members.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Добавлены:</p>
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                      {getInitials(member.name)}
                    </div>
                    <span className="text-sm">{member.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMembers((prev) => prev.filter((m) => m.id !== member.id))}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Button
        className="w-full"
        disabled={!name.trim() || isPending}
        onClick={() => createGroup()}
      >
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Создать группу
      </Button>
    </div>
  )
}
