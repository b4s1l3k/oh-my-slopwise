"use client"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDateTime } from "@/lib/utils/format"
import { MessageSquare } from "lucide-react"

type FeedbackItem = {
  id: string
  message: string
  createdAt: string
  user: { name: string; email: string }
}

export default function AdminFeedbackPage() {
  const { data, isLoading } = useQuery<FeedbackItem[]>({
    queryKey: ["admin", "feedback"],
    queryFn: async () => {
      const res = await fetch("/api/v1/admin/feedback")
      if (!res.ok) throw new Error("Ошибка загрузки")
      const json = await res.json()
      return json.feedbacks
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Обратная связь</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.length} сообщений` : "Загрузка..."}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : !data?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Обратной связи пока нет</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((item) => (
            <Card key={item.id}>
              <CardContent className="pt-4 pb-4 space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-medium">{item.user.name}</div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {formatDateTime(item.createdAt)}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">{item.user.email}</div>
                <p className="text-sm whitespace-pre-wrap">{item.message}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
