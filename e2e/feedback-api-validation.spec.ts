import { expect, test } from "@playwright/test"
import { login, users } from "./helpers"

test.describe("feedback API validation", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, users.bob)
  })

  test("accepts messages at the exact minimum and maximum", async ({ page }) => {
    for (const message of ["a".repeat(10), "b".repeat(2000)]) {
      const response = await page.request.post("/api/v1/feedback", { data: { message } })
      expect(response.status()).toBe(201)
      expect(await response.json()).toMatchObject({ feedback: { message } })
    }
  })

  test("rejects values just outside both length boundaries", async ({ page }) => {
    const cases = [
      { message: "a".repeat(9), expected: "Минимум 10 символов" },
      { message: "b".repeat(2001), expected: "Максимум 2000 символов" },
    ]

    for (const { message, expected } of cases) {
      const response = await page.request.post("/api/v1/feedback", { data: { message } })
      expect(response.status()).toBe(422)
      expect(await response.json()).toMatchObject({
        error: { fieldErrors: { message: [expected] } },
      })
    }
  })

  test("trims a real message and rejects whitespace-only content", async ({ page }) => {
    const trimmed = await page.request.post("/api/v1/feedback", {
      data: { message: "  Подробный отзыв после нормализации  " },
    })
    expect(trimmed.status()).toBe(201)
    expect(await trimmed.json()).toMatchObject({
      feedback: { message: "Подробный отзыв после нормализации" },
    })

    const blank = await page.request.post("/api/v1/feedback", {
      data: { message: " ".repeat(20) },
    })
    expect(blank.status()).toBe(422)
    expect(await blank.json()).toMatchObject({
      error: { fieldErrors: { message: ["Минимум 10 символов"] } },
    })
  })
})
