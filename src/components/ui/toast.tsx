"use client"
import { createContext, useContext, useState, useCallback, useEffect } from "react"
import { X, CheckCircle, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

type ToastVariant = "default" | "destructive"
type ToastItem = { id: string; title: string; description?: string; variant?: ToastVariant }

const ToastContext = createContext<{
  toast: (t: Omit<ToastItem, "id">) => void
}>({ toast: () => {} })

function ToastItemEl({ t, onDismiss }: { t: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000)
    return () => clearTimeout(timer)
  }, [onDismiss])

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
