import type {
  ApiOperationRequest,
  ApiOperationResponse,
} from "@contract/v1"

const CREDENTIALS_PATH = "/auth/credentials"
const REQUEST_ID_HEADER = "X-Request-ID"
const REQUEST_TIMEOUT_MS = 5_000

export async function authenticateCredentialsThroughApi(
  command: ApiOperationRequest<"authenticateCredentialsV1">
): Promise<ApiOperationResponse<"authenticateCredentialsV1", 200>["user"] | null> {
  const requestId = globalThis.crypto.randomUUID()
  const response = await fetch(`${backendApiBaseUrl()}${CREDENTIALS_PATH}`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      [REQUEST_ID_HEADER]: requestId,
    },
    body: JSON.stringify({
      email: command.email.trim().toLowerCase(),
      password: command.password,
    } satisfies ApiOperationRequest<"authenticateCredentialsV1">),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (response.status === 401) return null
  if (!response.ok) {
    throw new Error(`Credentials backend failed with HTTP ${response.status}`)
  }

  const body = await response.json() as unknown
  if (!isCredentialsResponse(body)) {
    throw new Error("Credentials backend returned an invalid response")
  }
  return body.user
}

function backendApiBaseUrl(): string {
  const configured = process.env.BACKEND_API_BASE_URL?.trim()
  if (configured) return absoluteUrl(configured).replace(/\/+$/, "")

  const webOrigin = process.env.AUTH_URL?.trim() || process.env.NEXTAUTH_URL?.trim()
  if (!webOrigin) {
    throw new Error("BACKEND_API_BASE_URL or AUTH_URL must be configured")
  }
  return `${absoluteUrl(webOrigin).replace(/\/+$/, "")}/api/v1`
}

function absoluteUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Backend API URL must use http or https")
  }
  return url.toString().replace(/\/+$/, "")
}

function isCredentialsResponse(
  value: unknown
): value is ApiOperationResponse<"authenticateCredentialsV1", 200> {
  if (!isRecord(value) || !isRecord(value.user)) return false
  const user = value.user
  return (
    typeof user.id === "string" &&
    typeof user.email === "string" &&
    typeof user.name === "string" &&
    (typeof user.avatarUrl === "string" || user.avatarUrl === null) &&
    (user.role === "USER" || user.role === "ADMIN")
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
