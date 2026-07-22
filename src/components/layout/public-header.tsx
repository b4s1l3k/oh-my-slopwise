import Link from "next/link"
import { Split } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PublicHeaderProps {
  callbackUrl?: string
}

export function PublicHeader({ callbackUrl }: PublicHeaderProps) {
  const loginHref = callbackUrl ? `/login?callbackUrl=${callbackUrl}` : "/login"
  const registerHref = callbackUrl ? `/register?callbackUrl=${callbackUrl}` : "/register"

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="rounded-lg bg-primary p-1.5">
            <Split className="h-5 w-5 text-primary-foreground" />
          </span>
          <span className="font-bold">SLOPwise</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Button variant="ghost" asChild>
            <Link href="/faq">FAQ</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href={loginHref}>Войти</Link>
          </Button>
          <Button asChild>
            <Link href={registerHref}>Регистрация</Link>
          </Button>
        </nav>
      </div>
    </header>
  )
}
