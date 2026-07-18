"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Users, Activity } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/dashboard", label: "Обзор", icon: LayoutDashboard },
  { href: "/groups", label: "Группы", icon: Users },
  { href: "/activity", label: "Активность", icon: Activity },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background flex">
      {navItems.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className="flex-1">
          <div
            className={cn(
              "flex flex-col items-center gap-1 py-3 text-xs text-muted-foreground hover:text-foreground transition-colors",
              pathname.startsWith(href) && "text-primary"
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </div>
        </Link>
      ))}
    </nav>
  )
}
