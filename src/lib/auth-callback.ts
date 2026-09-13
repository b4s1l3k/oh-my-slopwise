const FALLBACK_AUTH_CALLBACK = "/"
const CALLBACK_ORIGIN = "http://internal.invalid"

export function getSafeAuthCallback(callbackUrl: string | null): string {
  if (!callbackUrl?.startsWith("/") || callbackUrl.startsWith("//")) {
    return FALLBACK_AUTH_CALLBACK
  }

  try {
    const resolved = new URL(callbackUrl, CALLBACK_ORIGIN)
    if (resolved.origin !== CALLBACK_ORIGIN) return FALLBACK_AUTH_CALLBACK

    return `${resolved.pathname}${resolved.search}${resolved.hash}`
  } catch {
    return FALLBACK_AUTH_CALLBACK
  }
}
