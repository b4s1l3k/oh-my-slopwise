import { expect, test } from "@playwright/test"

test.describe("registration API", () => {
  test("normalizes identity fields, hides password data and permits case-insensitive login", async ({ page }) => {
    const response = await page.request.post("/api/v1/users/register", {
      data: {
        email: "  Normalized.User@Example.COM  ",
        name: "  Normalized User  ",
        password: "Normalized-password-123",
      },
    })

    expect(response.status()).toBe(201)
    const body = await response.json()
    expect(body).toEqual({
      user: {
        id: expect.any(String),
        email: "normalized.user@example.com",
        name: "Normalized User",
        avatarUrl: null,
      },
    })
    expect(JSON.stringify(body)).not.toMatch(/password|hash/i)

    await page.goto("/login")
    await page.getByLabel("Email").fill("NORMALIZED.USER@EXAMPLE.COM")
    await page.getByLabel("Пароль").fill("Normalized-password-123")
    await page.getByRole("button", { name: "Войти" }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByRole("heading", { name: /Привет, Normalized/ })).toBeVisible()
  })

  test("accepts exactly 72 password bytes and rejects 73 bytes", async ({ request }) => {
    const accepted = await request.post("/api/v1/users/register", {
      data: {
        email: "password-72.e2e@example.com",
        name: "Password 72",
        password: "a".repeat(72),
      },
    })
    expect(accepted.status()).toBe(201)

    const rejected = await request.post("/api/v1/users/register", {
      data: {
        email: "password-73.e2e@example.com",
        name: "Password 73",
        password: "a".repeat(73),
      },
    })
    expect(rejected.status()).toBe(422)
    expect(await rejected.json()).toMatchObject({
      error: { fieldErrors: { password: ["Пароль должен занимать не больше 72 байт UTF-8"] } },
    })
  })

  test("rejects whitespace-only names and malformed JSON", async ({ request }) => {
    const blankName = await request.post("/api/v1/users/register", {
      data: {
        email: "blank-name.e2e@example.com",
        name: "   ",
        password: "Blank-name-123",
      },
    })
    expect(blankName.status()).toBe(422)
    expect(await blankName.json()).toHaveProperty("error.fieldErrors.name")

    const malformed = await request.fetch("/api/v1/users/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      data: "{broken-json",
    })
    expect(malformed.status()).toBe(422)
    expect(await malformed.json()).toHaveProperty("error.formErrors")
  })

  test("allows only one of two concurrent registrations for the same email", async ({ request }) => {
    const data = {
      email: "concurrent-registration.e2e@example.com",
      name: "Concurrent Registration",
      password: "Concurrent-password-123",
    }

    const responses = await Promise.all([
      request.post("/api/v1/users/register", { data }),
      request.post("/api/v1/users/register", { data }),
    ])
    expect(responses.map((response) => response.status()).sort()).toEqual([201, 409])
    const conflict = responses.find((response) => response.status() === 409)
    expect(await conflict?.json()).toEqual({
      error: { message: "Пользователь с таким email уже существует" },
    })
  })
})
