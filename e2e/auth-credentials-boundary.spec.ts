import { expect, test } from "@playwright/test"
import { password, users } from "./helpers"

test.describe("credentials backend boundary", () => {
  test("returns only stable claims for valid credentials", async ({ request }) => {
    const response = await request.post("/api/v1/auth/credentials", {
      data: { email: `  ${users.alice.email.toUpperCase()}  `, password },
    })

    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      user: {
        id: expect.any(String),
        email: users.alice.email,
        name: users.alice.name,
        avatarUrl: null,
        role: "USER",
      },
    })
    expect(JSON.stringify(body)).not.toContain("password")
  })

  test("returns stable admin claims", async ({ request }) => {
    const response = await request.post("/api/v1/auth/credentials", {
      data: { email: users.admin.email, password },
    })

    expect(response.status()).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      user: { email: users.admin.email, role: "ADMIN" },
    })
  })

  test("does not reveal whether the account or password was wrong", async ({ request }) => {
    const attempts = [
      { email: users.alice.email, password: "wrong-password" },
      { email: "missing.e2e@example.com", password },
      { email: "not-an-email", password },
      { email: users.alice.email, password: "я".repeat(37) },
      { email: users.alice.email, password, unexpected: "field" },
    ]

    for (const data of attempts) {
      const response = await request.post("/api/v1/auth/credentials", { data })
      expect(response.status()).toBe(401)
      await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
    }
  })

  test("returns the same envelope for malformed JSON", async ({ request }) => {
    const response = await request.post("/api/v1/auth/credentials", {
      data: "{",
      headers: { "Content-Type": "application/json" },
    })

    expect(response.status()).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
  })
})
