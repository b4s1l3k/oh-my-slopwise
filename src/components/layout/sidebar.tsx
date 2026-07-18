"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { LayoutDashboard, Users, Activity, LogOut, Split } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const navItems = [
  { href: "/dashboard", label: "Обзор", icon: LayoutDashboard },
  { href: "/groups", label: "Группы", icon: Users },
  { href: "/activity", label: "Активность", icon: Activity },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden md:flex flex-col w-64 min-h-screen border-r bg-card px-4 py-6 gap-1">
      <div className="flex items-center gap-2 px-2 mb-8">
        <div className="bg-primary rounded-lg p-1.5">
          <Split className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="font-bold text-lg">Splitwise</span>
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}>
            <div
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                pathname.startsWith(href) && "bg-accent text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </div>
          </Link>
        ))}
      </nav>

      <Button
        variant="ghost"
        className="justify-start gap-3 text-muted-foreground hover:text-foreground"
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        <LogOut className="h-4 w-4" />
        Выйти
      </Button>
    </aside>
  )
}
