"use client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { feedbackSchema, type FeedbackInput } from "@/lib/validations/feedback"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/toast"
import { Loader2 } from "lucide-react"

export default function FeedbackPage() {
  const { toast } = useToast()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FeedbackInput>({ resolver: zodResolver(feedbackSchema) })

  const send = useMutation({
    mutationFn: async (data: FeedbackInput) => {
      const res = await fetch("/api/v1/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error("Ошибка отправки")
    },
    onSuccess: () => {
      reset()
      toast({ title: "Спасибо за отзыв!" })
    },
    onError: () => toast({ title: "Не удалось отправить", variant: "destructive" }),
  })

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Обратная связь</h1>
        <p className="text-sm text-muted-foreground">Напишите пожелание или сообщите о проблеме</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ваше сообщение</CardTitle>
          <CardDescription>Минимум 10 символов</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit((d) => send.mutate(d))} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="message">Сообщение</Label>
              <Textarea
                id="message"
                rows={5}
                placeholder="Опишите вашу идею или проблему..."
                {...register("message")}
              />
              {errors.message && (
                <p className="text-sm text-destructive">{errors.message.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={send.isPending}>
              {send.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Отправить
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
