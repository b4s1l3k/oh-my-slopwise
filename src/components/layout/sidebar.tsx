"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import {
  LayoutDashboard,
  Users,
  Activity,
  Split,
  User,
  MessageSquare,
  Shield,
  HelpCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/ui/theme-toggle"

const navItems = [
  { href: "/dashboard", label: "Обзор", icon: LayoutDashboard },
  { href: "/groups", label: "Группы", icon: Users },
  { href: "/activity", label: "Активность", icon: Activity },
  { href: "/profile", label: "Профиль", icon: User },
]

export function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === "ADMIN"

  return (
    <aside className="hidden md:flex flex-col w-64 h-full border-r bg-card px-4 py-6 gap-1">
      <div className="flex items-center gap-2 px-2 mb-8">
        <div className="bg-primary rounded-lg p-1.5">
          <Split className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="font-bold text-lg">SLOPwise</span>
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

      <div className="space-y-1 px-1">
        <Link href="/faq" className="block">
          <div
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
              pathname.startsWith("/faq") && "bg-accent text-accent-foreground"
            )}
          >
            <HelpCircle className="h-4 w-4" />
            Частые вопросы
          </div>
        </Link>
        <div className="flex items-center justify-between">
          <Link href={isAdmin ? "/admin/feedback" : "/feedback"} className="flex-1">
            <div
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                pathname.startsWith(isAdmin ? "/admin/feedback" : "/feedback") &&
                  "bg-accent text-accent-foreground"
              )}
            >
              {isAdmin ? (
                <Shield className="h-4 w-4" />
              ) : (
                <MessageSquare className="h-4 w-4" />
              )}
              {isAdmin ? "Админ-панель" : "Обратная связь"}
            </div>
          </Link>
          <ThemeToggle className="text-muted-foreground hover:text-foreground" />
        </div>
      </div>
    </aside>
  )
}
