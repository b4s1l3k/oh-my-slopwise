import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { FaqContent } from "@/components/faq/faq-content"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { PublicHeader } from "@/components/layout/public-header"

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
      <PublicHeader callbackUrl="/faq" />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:py-10">
        <FaqContent />
      </main>
    </div>
  )
}
