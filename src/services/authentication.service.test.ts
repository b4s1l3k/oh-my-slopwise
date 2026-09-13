import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const findUnique = vi.fn()
const bcryptCompare = vi.fn()
const bcryptHash = vi.fn().mockResolvedValue("DUMMY_HASH")

vi.mock("@/lib/db", () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}))

vi.mock("bcryptjs", () => ({
  default: {
    compare: (...args: unknown[]) => bcryptCompare(...args),
    hash: (...args: unknown[]) => bcryptHash(...args),
  },
}))

import { authenticateCredentials } from "@/services/authentication.service"

beforeEach(() => {
  findUnique.mockReset()
  bcryptCompare.mockReset()
})

afterEach(() => {
  delete process.env.ADMIN_EMAIL
})

describe("authenticateCredentials", () => {
  it.each([
    ["", "secret"],
    ["user@example.com", ""],
    ["user@example.com", "я".repeat(37)],
  ])("rejects unsafe credentials before persistence", async (email, password) => {
    await expect(authenticateCredentials(email, password)).resolves.toBeNull()
    expect(findUnique).not.toHaveBeenCalled()
    expect(bcryptCompare).not.toHaveBeenCalled()
  })

  it("normalizes email and runs a dummy comparison for an unknown user", async () => {
    findUnique.mockResolvedValue(null)

    await expect(authenticateCredentials("  USER@EXAMPLE.COM ", "secret"))
      .resolves.toBeNull()
    expect(findUnique).toHaveBeenCalledWith({ where: { email: "user@example.com" } })
    expect(bcryptCompare).toHaveBeenCalledWith("secret", expect.any(String))
  })

  it("returns null for an invalid password", async () => {
    findUnique.mockResolvedValue(userRow())
    bcryptCompare.mockResolvedValue(false)

    await expect(authenticateCredentials("user@example.com", "wrong"))
      .resolves.toBeNull()
    expect(bcryptCompare).toHaveBeenCalledWith("wrong", "HASH")
  })

  it("returns stable user claims for a valid password", async () => {
    findUnique.mockResolvedValue(userRow())
    bcryptCompare.mockResolvedValue(true)

    await expect(authenticateCredentials("user@example.com", "secret"))
      .resolves.toEqual({
        id: "u1",
        email: "user@example.com",
        name: "User",
        avatarUrl: null,
        role: "USER",
      })
  })

  it("projects the configured application admin role", async () => {
    process.env.ADMIN_EMAIL = " USER@EXAMPLE.COM "
    findUnique.mockResolvedValue(userRow())
    bcryptCompare.mockResolvedValue(true)

    await expect(authenticateCredentials("user@example.com", "secret"))
      .resolves.toMatchObject({ role: "ADMIN" })
  })
})

function userRow() {
  return {
    id: "u1",
    email: "user@example.com",
    name: "User",
    avatarUrl: null,
    passwordHash: "HASH",
  }
}
