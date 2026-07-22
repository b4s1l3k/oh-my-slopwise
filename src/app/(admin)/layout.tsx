import type { ReactNode } from "react"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Shield } from "lucide-react"

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.role !== "ADMIN") redirect("/dashboard")

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4 flex items-center gap-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Вернуться
        </Link>
        <div className="flex items-center gap-2 ml-2">
          <Shield className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Админ-панель</span>
        </div>
      </header>
      <main className="container mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  )
}
