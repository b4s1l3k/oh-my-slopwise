import { ApiError } from "@/lib/api/client/api-error"
import { canonicalJson } from "@/lib/canonical-json"
import { IDEMPOTENCY_KEY_HEADER } from "@/lib/idempotency-key"

const DEFAULT_API_BASE_URL = "/api/v1"
const REQUEST_ID_HEADER = "X-Request-ID"
const pendingIdempotencyKeys = new Map<string, string>()

type ApiErrorBody = {
  error?: string | {
    code?: string
    message?: string
    formErrors?: string[]
    fieldErrors?: Record<string, string[]>
  }
}

export type ApiCallOptions = {
  signal?: AbortSignal
  accessToken?: string
  requestId?: string
}

export type ApiRequestOptions = ApiCallOptions &
  Omit<RequestInit, "body" | "credentials" | "headers" | "signal"> & {
    body?: unknown
    headers?: HeadersInit
  }

function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL)
    .replace(/\/+$/, "")
}

function apiUrl(path: string): string {
  return `${apiBaseUrl()}/${path.replace(/^\/+/, "")}`
}

function newRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `request-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `command-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function isAbortError(error: unknown, signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true || (error instanceof Error && error.name === "AbortError")
}

function errorDetails(value: unknown): ApiErrorBody | undefined {
  return value != null && typeof value === "object" ? value as ApiErrorBody : undefined
}

function firstFieldError(fieldErrors: Record<string, string[]> | undefined): string | undefined {
  if (!fieldErrors) return undefined
  return Object.values(fieldErrors).find((errors) => errors.length > 0)?.[0]
}

function errorMetadata(value: unknown): { code?: string; userMessage?: string } {
  const error = errorDetails(value)?.error
  if (typeof error === "string") return { userMessage: error }
  if (!error || typeof error !== "object") return {}
  return {
    code: typeof error.code === "string" ? error.code : undefined,
    userMessage:
      (typeof error.message === "string" ? error.message : undefined) ??
      error.formErrors?.[0] ??
      firstFieldError(error.fieldErrors),
  }
}

async function responseBody(response: Response, fallbackRequestId: string): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return undefined
  const text = await response.text()
  const requestId = response.headers.get(REQUEST_ID_HEADER) ?? fallbackRequestId
  if (!text) {
    throw new ApiError(
      response.status,
      "INVALID_JSON_RESPONSE",
      undefined,
      requestId,
      undefined
    )
  }
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    throw new ApiError(
      response.status,
      "INVALID_JSON_RESPONSE",
      text.slice(0, 500),
      requestId,
      undefined,
      { cause: error }
    )
  }
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const {
    accessToken,
    body,
    headers: providedHeaders,
    requestId = newRequestId(),
    signal,
    ...requestInit
  } = options
  const headers = new Headers(providedHeaders)
  headers.set("Accept", "application/json")
  headers.set(REQUEST_ID_HEADER, requestId)
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`)
  if (body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  let response: Response
  try {
    response = await fetch(apiUrl(path), {
      ...requestInit,
      credentials: "include",
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    if (isAbortError(error, signal)) throw error
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      undefined,
      requestId,
      undefined,
      { cause: error }
    )
  }

  let parsedBody: unknown
  try {
    parsedBody = await responseBody(response, requestId)
  } catch (error) {
    if (error instanceof ApiError || isAbortError(error, signal)) throw error
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      undefined,
      response.headers.get(REQUEST_ID_HEADER) ?? requestId,
      undefined,
      { cause: error }
    )
  }
  if (!response.ok) {
    const { code, userMessage } = errorMetadata(parsedBody)
    throw new ApiError(
      response.status,
      code,
      parsedBody,
      response.headers.get(REQUEST_ID_HEADER) ?? requestId,
      userMessage
    )
  }
  return parsedBody as T
}

export async function idempotentApiRequest<T>(
  path: string,
  options: ApiRequestOptions
): Promise<T> {
  const fingerprint = `${options.method ?? "POST"} ${path} ${canonicalJson(options.body)}`
  const key = pendingIdempotencyKeys.get(fingerprint) ?? newIdempotencyKey()
  pendingIdempotencyKeys.set(fingerprint, key)

  const headers = new Headers(options.headers)
  headers.set(IDEMPOTENCY_KEY_HEADER, key)

  try {
    const result = await apiRequest<T>(path, { ...options, headers })
    pendingIdempotencyKeys.delete(fingerprint)
    return result
  } catch (error) {
    const retryableHttpStatus = error instanceof ApiError && [408, 425, 429].includes(error.status)
    if (
      error instanceof ApiError &&
      error.status >= 400 &&
      error.status < 500 &&
      !retryableHttpStatus
    ) {
      pendingIdempotencyKeys.delete(fingerprint)
    }
    throw error
  }
}
