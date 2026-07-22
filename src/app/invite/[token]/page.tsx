"use client"
import { use, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, Users, Split } from "lucide-react"

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()
  const [error, setError] = useState("")

  const { data, isLoading, isError } = useQuery({
    queryKey: ["invite", token],
    queryFn: async () => {
      const res = await fetch(`/api/v1/invites/${token}`)
      if (!res.ok) throw new Error("Приглашение недействительно")
      const json = await res.json()
      return json.invite as { groupId: string; groupName: string; memberCount: number; isAlreadyMember: boolean }
    },
    retry: false,
  })

  const accept = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/invites/${token}/accept`, { method: "POST" })
      if (!res.ok) throw new Error("Не удалось вступить")
      return (await res.json()) as { groupId: string }
    },
    onSuccess: (r) => router.push(`/groups/${r.groupId}`),
    onError: (e) => setError(e instanceof Error ? e.message : "Ошибка"),
  })

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-1">
          <div className="flex justify-center mb-2">
            <div className="bg-primary rounded-full p-3">
              <Split className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle>Приглашение в группу</CardTitle>
          {data && (
            <CardDescription>
              {data.isAlreadyMember ? "Вы уже участник этой группы" : "Вас пригласили присоединиться"}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isError || !data ? (
            <div className="text-center py-4">
              <p className="text-destructive font-medium">Приглашение недействительно</p>
              <p className="text-sm text-muted-foreground mt-1">
                Ссылку могли отозвать или она устарела.
              </p>
              <Button variant="outline" className="mt-4" onClick={() => router.push("/groups")}>
                К моим поездкам
              </Button>
            </div>
          ) : (
            <>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-lg font-semibold">{data.groupName}</p>
                <p className="text-sm text-muted-foreground flex items-center justify-center gap-1 mt-1">
                  <Users className="h-3.5 w-3.5" />
                  {data.memberCount} участников
                </p>
              </div>
              {error && <p className="text-sm text-destructive text-center">{error}</p>}
              {data.isAlreadyMember ? (
                <Button className="w-full" onClick={() => router.push(`/groups/${data.groupId}`)}>
                  Перейти в группу
                </Button>
              ) : (
                <Button
                  className="w-full"
                  onClick={() => accept.mutate()}
                  disabled={accept.isPending}
                >
                  {accept.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Присоединиться
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
