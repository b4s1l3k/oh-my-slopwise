import { NextResponse, type NextRequest } from "next/server"

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // --- Скрытая тропа для внимательного исследователя (только на сервере) ---
  // Финальный «стук»: заголовок с вычисленным значением открывает дверь.
  if (
    req.headers.get("x-the-way") ===
    "37290d74ac4d186e3a8e5785d259d2ec04fac91ae28092e7620ec8bc99e830aa"
  ) {
    return NextResponse.json({
      for: "Миша",
      message:
        "Привет, Миша! robots.txt → скрытый путь → hex в заголовке → sha256 — и ты здесь. Так ломать одно удовольствие. Все баги, что принесёшь, — кофе с нас. ☕ Таков путь.",
      signed: "команда SLOPwise",
    })
  }
  // Путь, спрятанный в robots.txt (Disallow), выдаёт следующую подсказку —
  // hex в заголовке X-Breadcrumb (тело намеренно обманка).
  if (pathname === "/q/86f2a1") {
    return new NextResponse("# keep digging\n", {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-breadcrumb": "582d5468652d576179203d207368613235362822636f666665652229",
      },
    })
  }
  // -----------------------------------------------------------------------

  const authPaths = ["/login", "/register"]
  const isAuthPath = authPaths.some((p) => pathname.startsWith(p))
  // robots.txt и .well-known должны читаться без сессии.
  const isPublic =
    isAuthPath ||
    pathname === "/" ||
    pathname === "/faq" ||
    pathname === "/robots.txt" ||
    pathname.startsWith("/.well-known/")
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
