const DEFAULT_CONNECTION_LIMIT = 10
const DEFAULT_POOL_TIMEOUT_SECONDS = 10
const DEFAULT_CONNECT_TIMEOUT_SECONDS = 5
const DEFAULT_SOCKET_TIMEOUT_SECONDS = 15

/**
 * Applies bounded runtime defaults without overriding operator-provided DSN
 * parameters. The total database budget is connection_limit * app replicas.
 */
export function buildRuntimeDatabaseUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL")
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres or postgresql protocol")
  }

  const defaults: Record<string, number> = {
    connection_limit: DEFAULT_CONNECTION_LIMIT,
    pool_timeout: DEFAULT_POOL_TIMEOUT_SECONDS,
    connect_timeout: DEFAULT_CONNECT_TIMEOUT_SECONDS,
    socket_timeout: DEFAULT_SOCKET_TIMEOUT_SECONDS,
  }
  for (const [key, value] of Object.entries(defaults)) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, String(value))
  }
  return url.toString()
}
