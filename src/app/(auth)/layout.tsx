import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  if (session) redirect("/")
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 px-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}
