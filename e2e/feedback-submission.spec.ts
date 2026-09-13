import { expect, test } from "@playwright/test"
import { login, users } from "./helpers"

test.describe("feedback submission", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, users.bob)
    await page.goto("/feedback")
  })

  test("validates both message boundaries in the UI", async ({ page }) => {
    const message = page.getByLabel("Сообщение")

    await message.fill("short")
    await page.getByRole("button", { name: "Отправить" }).click()
    await expect(page.locator("form").getByText("Минимум 10 символов", { exact: true })).toBeVisible()

    await message.fill("x".repeat(2001))
    await page.getByRole("button", { name: "Отправить" }).click()
    await expect(page.locator("form").getByText("Максимум 2000 символов", { exact: true })).toBeVisible()
  })

  test("sends a valid message and clears the form", async ({ page }) => {
    const messageText = "Подробный E2E отзыв о работе приложения"
    const message = page.getByLabel("Сообщение")

    await message.fill(messageText)
    await page.getByRole("button", { name: "Отправить" }).click()
    await expect(page.getByText("Спасибо за отзыв!", { exact: true })).toBeVisible()
    await expect(message).toHaveValue("")
  })

  test("preserves the form state when the server rejects submission", async ({ page }) => {
    await page.route("**/api/v1/feedback", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Internal error" } }),
      })
    })

    const message = page.getByLabel("Сообщение")
    await message.fill("Сообщение останется после ошибки")
    await page.getByRole("button", { name: "Отправить" }).click()
    await expect(page.getByText("Не удалось отправить", { exact: true })).toBeVisible()
    await expect(message).toHaveValue("Сообщение останется после ошибки")
  })
})
