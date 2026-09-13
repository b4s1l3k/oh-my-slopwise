import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError, getApiErrorMessage } from "@/lib/api/client/api-error"
import { apiRequest } from "@/lib/api/client/http-client"

const fetchMock = vi.fn<typeof fetch>()

describe("apiRequest", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "")
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("parses a successful JSON response and configures transport defaults", async () => {
    fetchMock.mockResolvedValue(Response.json({ value: 42 }))

    await expect(apiRequest<{ value: number }>("/items")).resolves.toEqual({ value: 42 })

    const [url, options] = fetchMock.mock.calls[0]
    const headers = new Headers(options?.headers)
    expect(url).toBe("/api/v1/items")
    expect(options?.credentials).toBe("include")
    expect(headers.get("Accept")).toBe("application/json")
    expect(headers.get("X-Request-ID")).toMatch(/^[0-9a-f-]{36}$/)
  })

  it.each([204, 205])("returns undefined for an empty %i response", async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }))

    await expect(apiRequest<void>("/items/1", { method: "DELETE" })).resolves.toBeUndefined()
  })

  it("rejects an unexpected empty JSON response with the client request ID", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))

    const error = await rejectedApiError(apiRequest("/items", { requestId: "request-123" }))
    expect(error).toMatchObject({
      status: 200,
      code: "INVALID_JSON_RESPONSE",
      details: undefined,
      requestId: "request-123",
    })
  })

  it("uses a configured base URL without duplicate slashes", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://backend.example.test/api/v2///")
    fetchMock.mockResolvedValue(Response.json({ ok: true }))

    await apiRequest("/items")

    expect(fetchMock.mock.calls[0][0]).toBe("https://backend.example.test/api/v2/items")
  })

  it("generates a request ID when crypto.randomUUID is unavailable", async () => {
    vi.stubGlobal("crypto", {})
    fetchMock.mockResolvedValue(Response.json({ ok: true }))

    await apiRequest("/items")

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers)
    expect(headers.get("X-Request-ID")).toMatch(/^request-[a-z0-9]+-[a-z0-9]+$/)
  })

  it("sends access token, request ID, signal, and a JSON body", async () => {
    const controller = new AbortController()
    fetchMock.mockResolvedValue(Response.json({ ok: true }))

    await apiRequest("/items", {
      method: "POST",
      accessToken: "access-token",
      requestId: "request-123",
      signal: controller.signal,
      body: { name: "Item" },
    })

    const options = fetchMock.mock.calls[0][1]
    const headers = new Headers(options?.headers)
    expect(options?.signal).toBe(controller.signal)
    expect(options?.body).toBe(JSON.stringify({ name: "Item" }))
    expect(headers.get("Authorization")).toBe("Bearer access-token")
    expect(headers.get("Content-Type")).toBe("application/json")
    expect(headers.get("X-Request-ID")).toBe("request-123")
  })

  it("maps a legacy string error to ApiError", async () => {
    fetchMock.mockResolvedValue(Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "X-Request-ID": "response-request-id" } }
    ))

    const error = await rejectedApiError(apiRequest("/items", { requestId: "client-request-id" }))
    expect(error).toMatchObject({
      status: 401,
      code: undefined,
      userMessage: "Unauthorized",
      requestId: "response-request-id",
      details: { error: "Unauthorized" },
    })
  })

  it("maps a structured service error to ApiError", async () => {
    fetchMock.mockResolvedValue(Response.json(
      { error: { code: "NOT_FOUND", message: "Не найдено" } },
      { status: 404 }
    ))

    const error = await rejectedApiError(apiRequest("/items", { requestId: "request-123" }))
    expect(error).toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      userMessage: "Не найдено",
      requestId: "request-123",
    })
    expect(getApiErrorMessage(error, "fallback")).toBe("Не найдено")
  })

  it("extracts the first Zod field error", async () => {
    fetchMock.mockResolvedValue(Response.json(
      {
        error: {
          formErrors: [],
          fieldErrors: { name: ["Имя обязательно"] },
        },
      },
      { status: 422 }
    ))

    const error = await rejectedApiError(apiRequest("/items"))
    expect(error.userMessage).toBe("Имя обязательно")
  })

  it("reports an invalid JSON response with the response request ID", async () => {
    fetchMock.mockResolvedValue(new Response("not-json", {
      status: 502,
      headers: { "X-Request-ID": "response-request-id" },
    }))

    const error = await rejectedApiError(apiRequest("/items"))
    expect(error).toMatchObject({
      status: 502,
      code: "INVALID_JSON_RESPONSE",
      details: "not-json",
      requestId: "response-request-id",
    })
    expect(error.cause).toBeInstanceOf(SyntaxError)
  })

  it("maps a network failure to ApiError", async () => {
    const cause = new TypeError("fetch failed")
    fetchMock.mockRejectedValue(cause)

    const error = await rejectedApiError(apiRequest("/items", { requestId: "request-123" }))
    expect(error).toMatchObject({
      status: 0,
      code: "NETWORK_ERROR",
      requestId: "request-123",
    })
    expect(error.cause).toBe(cause)
  })

  it("maps a response body stream failure to ApiError", async () => {
    const cause = new TypeError("terminated")
    const response = new Response(null, {
      status: 200,
      headers: { "X-Request-ID": "response-request-id" },
    })
    vi.spyOn(response, "text").mockRejectedValue(cause)
    fetchMock.mockResolvedValue(response)

    const error = await rejectedApiError(apiRequest("/items"))
    expect(error).toMatchObject({
      status: 0,
      code: "NETWORK_ERROR",
      requestId: "response-request-id",
    })
    expect(error.cause).toBe(cause)
  })

  it("preserves an abort error for React Query cancellation", async () => {
    const controller = new AbortController()
    const abortError = new DOMException("The operation was aborted", "AbortError")
    fetchMock.mockRejectedValue(abortError)
    controller.abort()

    await expect(apiRequest("/items", { signal: controller.signal })).rejects.toBe(abortError)
  })
})

async function rejectedApiError(request: Promise<unknown>): Promise<ApiError> {
  try {
    await request
    throw new Error("Expected API request to reject")
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    return error as ApiError
  }
}
