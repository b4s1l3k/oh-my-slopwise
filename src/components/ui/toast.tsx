"use client"
import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react"
import { X, CheckCircle, AlertCircle, Trophy } from "lucide-react"
import { cn } from "@/lib/utils"
import { getAchievementIcon } from "@/lib/achievement-icons"
import type { ReactNode } from "react"

type ToastVariant = "default" | "destructive"
type ToastItem = {
  id: string
  title: string
  description?: string
  variant?: ToastVariant
  // Особый вид уведомления «получена ачивка» (оформление в стиле Steam).
  kind?: "achievement"
  // Строковый ключ иконки ачивки (см. lib/achievement-icons).
  iconName?: string
}

const DEFAULT_DURATION = 4000
const ACHIEVEMENT_DURATION = 6000

const ToastContext = createContext<{
  toast: (t: Omit<ToastItem, "id">) => void
}>({ toast: () => {} })

function ToastItemEl({ t, onDismiss }: { t: ToastItem; onDismiss: () => void }) {
  const duration = t.kind === "achievement" ? ACHIEVEMENT_DURATION : DEFAULT_DURATION
  // Держим последний onDismiss в ref, чтобы таймер ставился один раз и не
  // сбрасывался при каждом ре-рендере провайдера (иначе тосты не закрываются
  // по своему таймеру, а «слипаются» — особенно заметно на серии ачивок).
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss
  useEffect(() => {
    const timer = setTimeout(() => onDismissRef.current(), duration)
    return () => clearTimeout(timer)
  }, [duration])

  if (t.kind === "achievement") {
    const Icon = getAchievementIcon(t.iconName ?? "")
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border border-amber-400/40 px-4 py-3 shadow-xl",
          "bg-gradient-to-br from-zinc-900 to-zinc-800 text-zinc-50",
          "animate-in slide-in-from-right-full fade-in duration-500"
        )}
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-400/15 ring-1 ring-amber-400/50">
          <Icon className="h-6 w-6 text-amber-400" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-400">
            <Trophy className="h-3 w-3" aria-hidden="true" />
            Достижение получено
          </p>
          <p className="truncate font-semibold leading-tight">{t.title}</p>
          {t.description && (
            <p className="mt-0.5 truncate text-xs text-zinc-400">{t.description}</p>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="text-zinc-400 transition-colors hover:text-zinc-100"
          aria-label="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg text-sm animate-in slide-in-from-right-full duration-300",
        t.variant === "destructive"
          ? "bg-destructive text-destructive-foreground border-destructive"
          : "bg-background text-foreground border-border"
      )}
    >
      {t.variant === "destructive" ? (
        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
      ) : (
        <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-green-500" />
      )}
      <div className="flex-1">
        <p className="font-medium">{t.title}</p>
        {t.description && <p className="mt-0.5 opacity-90">{t.description}</p>}
      </div>
      <button onClick={onDismiss} className="opacity-70 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const toast = useCallback((t: Omit<ToastItem, "id">) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { ...t, id }])
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((x) => x.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItemEl t={t} onDismiss={() => dismiss(t.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
