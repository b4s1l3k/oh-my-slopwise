import type { Metadata } from "next"
import Link from "next/link"
import { Split } from "lucide-react"
import { auth } from "@/lib/auth"
import { FaqContent } from "@/components/faq/faq-content"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Частые вопросы — SLOPwise",
  description: "Ответы на частые вопросы о группах, расходах и расчётах в SLOPwise",
}

export default async function FaqPage() {
  const session = await auth()

  if (session) {
    return (
      <DashboardShell>
        <FaqContent />
      </DashboardShell>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
          <Link href="/faq" className="flex items-center gap-2">
            <span className="rounded-lg bg-primary p-1.5">
              <Split className="h-5 w-5 text-primary-foreground" />
            </span>
            <span className="font-bold">SLOPwise</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/login?callbackUrl=/faq">Войти</Link>
            </Button>
            <Button asChild>
              <Link href="/register?callbackUrl=/faq">Регистрация</Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:py-10">
        <FaqContent />
      </main>
    </div>
  )
}
