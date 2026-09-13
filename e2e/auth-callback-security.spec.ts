import { expect, test } from "@playwright/test"
import { password, users } from "./helpers"

async function submitLogin(page: import("@playwright/test").Page): Promise<void> {
  await page.getByLabel("Email").fill(users.alice.email)
  await page.getByLabel("Пароль").fill(password)
  await page.getByRole("button", { name: "Войти" }).click()
}

test.describe("authentication callbacks", () => {
  test("returns a signed-in user to an internal protected page", async ({ page }) => {
    await page.goto("/login?callbackUrl=%2Fprofile")
    await submitLogin(page)

    await expect(page).toHaveURL(/\/profile$/)
    await expect(page.getByRole("heading", { name: "Профиль", exact: true })).toBeVisible()
  })

  test("does not redirect login to absolute, protocol-relative or script URLs", async ({ page }) => {
    const unsafeCallbacks = [
      "https://example.com/collect-session",
      "//example.com/collect-session",
      "/\\\\example.com/collect-session",
      "javascript:document.body.dataset.compromised='true'",
    ]

    for (const callback of unsafeCallbacks) {
      await page.context().clearCookies()
      await page.goto(`/login?callbackUrl=${encodeURIComponent(callback)}`)
      await submitLogin(page)

      await expect(page).toHaveURL(/\/dashboard$/)
      expect(new URL(page.url()).origin).toBe("http://127.0.0.1:3100")
      expect(await page.locator("body").getAttribute("data-compromised")).toBeNull()
    }
  })

  test("does not redirect a newly registered user to an external origin", async ({ page }) => {
    const email = "callback-registration.e2e@example.com"
    const callback = encodeURIComponent("https://example.com/collect-registration")
    await page.goto(`/register?callbackUrl=${callback}`)
    await page.getByLabel("Имя").fill("Callback E2E")
    await page.getByLabel("Email").fill(email)
    await page.getByLabel("Пароль").fill("Callback-password-123")
    await page.getByRole("button", { name: "Зарегистрироваться" }).click()

    await expect(page).toHaveURL(/\/dashboard$/)
    expect(new URL(page.url()).origin).toBe("http://127.0.0.1:3100")
  })
})
