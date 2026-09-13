import { beforeEach, describe, expect, it, vi } from "vitest"

let capturedAuthorize: (credentials: unknown) => Promise<unknown>

const authenticateCredentialsThroughApi = vi.fn()

vi.mock("next-auth", () => ({
  default: () => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }),
}))

vi.mock("next-auth/providers/credentials", () => ({
  default: (config: { authorize: (credentials: unknown) => Promise<unknown> }) => {
    capturedAuthorize = config.authorize
    return config
  },
}))

vi.mock("@/lib/auth/credentials-client", () => ({
  authenticateCredentialsThroughApi: (...args: unknown[]) =>
    authenticateCredentialsThroughApi(...args),
}))

beforeEach(async () => {
  vi.resetModules()
  authenticateCredentialsThroughApi.mockReset()
  await import("@/lib/auth")
})

describe("authorize (Credentials provider)", () => {
  it.each([
    null,
    {},
    { email: "user@example.com" },
    { password: "secret" },
    { email: "", password: "secret" },
    { email: "user@example.com", password: "" },
  ])("rejects an incomplete credentials payload locally", async (credentials) => {
    await expect(capturedAuthorize(credentials)).resolves.toBeNull()
    expect(authenticateCredentialsThroughApi).not.toHaveBeenCalled()
  })

  it("delegates credential verification to the backend boundary", async () => {
    authenticateCredentialsThroughApi.mockResolvedValue(null)

    await expect(capturedAuthorize({
      email: "  USER@EXAMPLE.COM  ",
      password: "secret",
    })).resolves.toBeNull()

    expect(authenticateCredentialsThroughApi).toHaveBeenCalledWith({
      email: "  USER@EXAMPLE.COM  ",
      password: "secret",
    })
  })

  it("maps verified backend claims to the Auth.js user", async () => {
    authenticateCredentialsThroughApi.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      name: "Иван",
      avatarUrl: "https://example.test/avatar.png",
      role: "ADMIN",
    })

    await expect(capturedAuthorize({
      email: "user@example.com",
      password: "secret",
    })).resolves.toEqual({
      id: "u1",
      email: "user@example.com",
      name: "Иван",
      image: "https://example.test/avatar.png",
      role: "ADMIN",
    })
  })

  it("does not hide a backend outage as an invalid password", async () => {
    const error = new Error("backend unavailable")
    authenticateCredentialsThroughApi.mockRejectedValue(error)

    await expect(capturedAuthorize({
      email: "user@example.com",
      password: "secret",
    })).rejects.toBe(error)
  })
})
