import type { ReactNode } from "react"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Sidebar } from "@/components/layout/sidebar"
import { MobileNav } from "@/components/layout/mobile-nav"

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="container mx-auto max-w-4xl px-4 py-6">{children}</div>
      </main>
      <MobileNav />
    </div>
  )
}
