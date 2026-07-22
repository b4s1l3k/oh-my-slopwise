import type { ReactNode } from "react"
import { Sidebar } from "@/components/layout/sidebar"
import { MobileNav } from "@/components/layout/mobile-nav"

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="container mx-auto max-w-4xl px-4 py-6">{children}</div>
      </main>
      <MobileNav />
    </div>
  )
}
