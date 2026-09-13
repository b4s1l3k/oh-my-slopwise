import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { authenticateCredentialsThroughApi } from "@/lib/auth/credentials-client"

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  vi.stubEnv("BACKEND_API_BASE_URL", "http://backend.test/api/v1/")
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("authenticateCredentialsThroughApi", () => {
  it("normalizes email and calls the server-only backend boundary", async () => {
    fetchMock.mockResolvedValue(Response.json({
      user: {
        id: "u1",
        email: "user@example.com",
        name: "User",
        avatarUrl: null,
        role: "USER",
      },
    }))

    await expect(authenticateCredentialsThroughApi({
      email: "  USER@EXAMPLE.COM ",
      password: "secret",
    })).resolves.toMatchObject({ id: "u1", role: "USER" })

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe("http://backend.test/api/v1/auth/credentials")
    expect(options?.method).toBe("POST")
    expect(options?.body).toBe(JSON.stringify({
      email: "user@example.com",
      password: "secret",
    }))
    const headers = new Headers(options?.headers)
    expect(headers.get("Accept")).toBe("application/json")
    expect(headers.get("Content-Type")).toBe("application/json")
    expect(headers.get("X-Request-ID")).toMatch(/^[0-9a-f-]{36}$/)
    expect(options?.signal).toBeInstanceOf(AbortSignal)
  })

  it("derives the legacy same-origin API URL from AUTH_URL", async () => {
    vi.stubEnv("BACKEND_API_BASE_URL", "")
    vi.stubEnv("AUTH_URL", "https://web.example.test/")
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }))

    await expect(authenticateCredentialsThroughApi({
      email: "user@example.com",
      password: "wrong",
    })).resolves.toBeNull()

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://web.example.test/api/v1/auth/credentials"
    )
  })

  it("returns null only for an explicit invalid-credentials response", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }))

    await expect(authenticateCredentialsThroughApi({
      email: "user@example.com",
      password: "wrong",
    })).resolves.toBeNull()
  })

  it("surfaces backend availability errors", async () => {
    fetchMock.mockResolvedValue(Response.json(
      { error: "Internal server error" },
      { status: 503 }
    ))

    await expect(authenticateCredentialsThroughApi({
      email: "user@example.com",
      password: "secret",
    })).rejects.toThrow("Credentials backend failed with HTTP 503")
  })

  it.each([
    null,
    {},
    { user: null },
    { user: { id: "u1", email: "user@example.com", name: "User", avatarUrl: null } },
    {
      user: {
        id: "u1",
        email: "user@example.com",
        name: "User",
        avatarUrl: null,
        role: "OWNER",
      },
    },
  ])("rejects an invalid backend success payload", async (body) => {
    fetchMock.mockResolvedValue(Response.json(body))

    await expect(authenticateCredentialsThroughApi({
      email: "user@example.com",
      password: "secret",
    })).rejects.toThrow("Credentials backend returned an invalid response")
  })

  it("requires an explicit backend or web origin", async () => {
    vi.stubEnv("BACKEND_API_BASE_URL", "")
    vi.stubEnv("AUTH_URL", "")
    vi.stubEnv("NEXTAUTH_URL", "")

    await expect(authenticateCredentialsThroughApi({
      email: "user@example.com",
      password: "secret",
    })).rejects.toThrow("BACKEND_API_BASE_URL or AUTH_URL must be configured")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
