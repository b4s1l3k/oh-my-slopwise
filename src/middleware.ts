import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export default auth(function middleware(req) {
  const { pathname } = req.nextUrl
  const isAuthenticated = !!req.auth

  const authPaths = ["/login", "/register"]
  const isAuthPath = authPaths.some((p) => pathname.startsWith(p))
  const isPublic = isAuthPath || pathname === "/faq"
  const isApi = pathname.startsWith("/api")

  if (isApi) return NextResponse.next()

  if (!isAuthenticated && !isPublic) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (isAuthenticated && isAuthPath) {
    return NextResponse.redirect(new URL("/", req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
