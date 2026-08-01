import { NextResponse, type NextRequest } from "next/server"

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const authPaths = ["/login", "/register"]
  const isAuthPath = authPaths.some((p) => pathname.startsWith(p))
  const isPublic = isAuthPath || pathname === "/" || pathname === "/faq"
  const isApi = pathname.startsWith("/api")

  if (isApi) return NextResponse.next()

  // This is only an early UX redirect. Dashboard layouts and every API route
  // perform authoritative session validation on the Node.js runtime.
  const hasSessionCookie = req.cookies
    .getAll()
    .some(({ name }) =>
      name === "authjs.session-token" ||
      name.startsWith("authjs.session-token.") ||
      name === "__Secure-authjs.session-token" ||
      name.startsWith("__Secure-authjs.session-token.")
    )

  if (!hasSessionCookie && !isPublic) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
