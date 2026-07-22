"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import {
  LayoutDashboard,
  Users,
  Activity,
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
  { href: "/activity", label: "События", icon: Activity },
  { href: "/profile", label: "Профиль", icon: User },
  { href: "/faq", label: "FAQ", icon: HelpCircle },
]

export function MobileNav() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === "ADMIN"
  const extraHref = isAdmin ? "/admin/feedback" : "/feedback"
  const ExtraIcon = isAdmin ? Shield : MessageSquare
  const extraLabel = isAdmin ? "Админ" : "Отзыв"

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background flex">
      {navItems.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className="flex-1">
          <div
            className={cn(
              "flex flex-col items-center gap-1 py-3 text-[11px] text-muted-foreground hover:text-foreground transition-colors",
              pathname.startsWith(href) && "text-primary"
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </div>
        </Link>
      ))}
      <Link href={extraHref} className="flex-1">
        <div
          className={cn(
            "flex flex-col items-center gap-1 py-3 text-[11px] text-muted-foreground hover:text-foreground transition-colors",
            pathname.startsWith(extraHref) && "text-primary"
          )}
        >
          <ExtraIcon className="h-5 w-5" />
          {extraLabel}
        </div>
      </Link>
      <div className="flex-1 flex items-center justify-center">
        <ThemeToggle className="text-muted-foreground hover:text-foreground" />
      </div>
    </nav>
  )
}
