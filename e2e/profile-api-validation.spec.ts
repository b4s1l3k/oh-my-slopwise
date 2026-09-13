import { expect, test } from "@playwright/test"
import { login, users } from "./helpers"

test.describe("profile API validation", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, users.outsider)
  })

  test("rejects invalid names, unsafe avatars and oversized requisites", async ({ page }) => {
    const cases = [
      { name: "" },
      { name: "x".repeat(101) },
      { avatarUrl: "javascript:alert(1)" },
      { avatarUrl: "data:text/html,unsafe" },
      { payeeName: "x".repeat(201) },
      { bankName: "x".repeat(101) },
      { payeeAccount: "x".repeat(101) },
    ]

    for (const body of cases) {
      const response = await page.request.patch("/api/v1/users/me", { data: body })
      expect(response.status(), JSON.stringify(body)).toBe(422)
      expect(await response.json()).toHaveProperty("error.fieldErrors")
    }
  })

  test("trims values, converts blank requisites to null and accepts an HTTPS avatar", async ({ page }) => {
    const response = await page.request.patch("/api/v1/users/me", {
      data: {
        name: "  Внешний Обновлённый  ",
        avatarUrl: "https://example.com/avatar.png",
        payeeName: "  Получатель  ",
        bankName: "   ",
        payeeAccount: "  ACCOUNT-42  ",
      },
    })
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.user).toMatchObject({
      name: "Внешний Обновлённый",
      avatarUrl: "https://example.com/avatar.png",
      payeeName: "Получатель",
      bankName: null,
      payeeAccount: "ACCOUNT-42",
    })

    const restore = await page.request.patch("/api/v1/users/me", {
      data: {
        name: users.outsider.name,
        avatarUrl: null,
        payeeName: null,
        bankName: null,
        payeeAccount: null,
      },
    })
    expect(restore.status()).toBe(200)
  })

  test("returns controlled validation JSON for malformed requests", async ({ page }) => {
    const malformed = await page.request.fetch("/api/v1/users/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      data: "{broken-json",
    })
    expect(malformed.status()).toBe(422)
    expect(await malformed.json()).toHaveProperty("error.formErrors")

    const nonObject = await page.request.patch("/api/v1/users/me", { data: ["not", "an", "object"] })
    expect(nonObject.status()).toBe(422)
  })
})
