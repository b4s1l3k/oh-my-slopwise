"use client"
import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useSession } from "next-auth/react"
import { useToast } from "@/components/ui/toast"

type UnseenResponse = {
  unlocked: { id: string; title: string; description: string; icon: string }[]
}

// Пауза между всплывающими тостами, если открылось несколько ачивок сразу —
// чтобы они появлялись по очереди, как в Steam, а не одной кучей.
const STAGGER_MS = 900
// Небольшая задержка после мутации: балансы/статистика успевают записаться.
const DEBOUNCE_MS = 500

/**
 * Следит за успешными мутациями (TanStack Query) и после каждой спрашивает у
 * сервера непоказанные разблокировки ачивок, показывая по ним тосты. Работает
 * на любом экране, поэтому уведомление всплывает сразу после действия.
 */
export function AchievementWatcher() {
  const queryClient = useQueryClient()
  const { status } = useSession()
  const { toast } = useToast()

  const authed = status === "authenticated"
  const inFlight = useRef(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Держим свежие toast/queryClient без пересоздания подписки на каждый рендер.
  const toastRef = useRef(toast)
  const clientRef = useRef(queryClient)
  toastRef.current = toast
  clientRef.current = queryClient

  useEffect(() => {
    if (!authed) return

    const check = async () => {
      if (inFlight.current) return
      inFlight.current = true
      try {
        const res = await fetch("/api/v1/users/me/achievements/unseen")
        if (!res.ok) return
        const data = (await res.json()) as UnseenResponse
        if (!data.unlocked?.length) return

        data.unlocked.forEach((achievement, index) => {
          setTimeout(() => {
            toastRef.current({
              kind: "achievement",
              iconName: achievement.icon,
              title: achievement.title,
              description: achievement.description,
            })
          }, index * STAGGER_MS)
        })
        // Обновим список ачивок в профиле, если он открыт.
        clientRef.current.invalidateQueries({ queryKey: ["achievements"] })
      } catch {
        // Тихо игнорируем — уведомления не критичны.
      } finally {
        inFlight.current = false
      }
    }

    const schedule = () => {
      if (debounce.current) clearTimeout(debounce.current)
      debounce.current = setTimeout(check, DEBOUNCE_MS)
    }

    // Проверяем при загрузке (вдруг что-то открылось на другом экране/устройстве).
    schedule()

    // ...и после каждой успешной мутации.
    const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.mutation.state.status === "success") {
        schedule()
      }
    })

    return () => {
      if (debounce.current) clearTimeout(debounce.current)
      unsubscribe()
    }
  }, [authed, queryClient])

  return null
}
