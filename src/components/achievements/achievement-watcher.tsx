"use client"
import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useSession } from "next-auth/react"
import { useToast } from "@/components/ui/toast"
import { useCollectUnseenAchievements } from "@/hooks/api/use-achievements"

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
  const collectUnseenAchievements = useCollectUnseenAchievements()

  const authed = status === "authenticated"
  const inFlight = useRef(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Держим свежий toast без пересоздания подписки на каждый рендер.
  const toastRef = useRef(toast)
  toastRef.current = toast

  useEffect(() => {
    if (!authed) return
    const controller = new AbortController()
    const notificationTimers = new Set<ReturnType<typeof setTimeout>>()

    const check = async () => {
      if (inFlight.current) return
      inFlight.current = true
      try {
        const data = await collectUnseenAchievements(controller.signal)
        if (!data.length) return

        data.forEach((achievement, index) => {
          const timer = setTimeout(() => {
            notificationTimers.delete(timer)
            toastRef.current({
              kind: "achievement",
              iconName: achievement.icon,
              title: achievement.title,
              description: achievement.description,
            })
          }, index * STAGGER_MS)
          notificationTimers.add(timer)
        })
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
      controller.abort()
      if (debounce.current) clearTimeout(debounce.current)
      notificationTimers.forEach(clearTimeout)
      notificationTimers.clear()
      unsubscribe()
    }
  }, [authed, collectUnseenAchievements, queryClient])

  return null
}
