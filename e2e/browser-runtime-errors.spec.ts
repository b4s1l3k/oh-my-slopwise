import { expect, test, type Page } from "@playwright/test"
import {
  collectRuntimeErrors,
  expectNoRuntimeErrorsAfterSettling,
  login,
  users,
} from "./helpers"

async function expectHeading(page: Page, path: string, name: string | RegExp): Promise<void> {
  await page.goto(path)
  await expect(page.getByRole("heading", { name }).first()).toBeVisible()
}

test.describe("browser runtime health", () => {
  test("critical public pages render without console or page errors", async ({ page }) => {
    const errors = collectRuntimeErrors(page)

    await expectHeading(page, "/", /Делите эмоции/)
    await expectHeading(page, "/faq", /частые вопросы/i)
    await page.goto("/login")
    await expect(page.getByRole("button", { name: "Войти" })).toBeVisible()
    await page.goto("/register")
    await expect(page.getByRole("button", { name: "Зарегистрироваться" })).toBeVisible()

    await expectNoRuntimeErrorsAfterSettling(page, errors)
  })

  test("critical authenticated pages render without console or page errors", async ({ page }) => {
    const errors = collectRuntimeErrors(page)
    await login(page, users.alice)

    await expectHeading(page, "/dashboard", /Привет, Алиса/)
    await expectHeading(page, "/groups", "Группы")
    await expectHeading(page, "/activity", "Активность")
    await expectHeading(page, "/profile", "Профиль")
    await expectHeading(page, "/feedback", "Обратная связь")

    await expectNoRuntimeErrorsAfterSettling(page, errors)
  })

  test("admin page renders without console or page errors", async ({ page }) => {
    const errors = collectRuntimeErrors(page)
    await login(page, users.admin)

    await expectHeading(page, "/admin/feedback", "Обратная связь")
    await expectNoRuntimeErrorsAfterSettling(page, errors)
  })
})
