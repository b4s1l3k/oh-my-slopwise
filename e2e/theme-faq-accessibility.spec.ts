import { expect, test } from "@playwright/test"
import { password, users } from "./helpers"

test.describe("theme and FAQ accessibility", () => {
  test("persists the selected theme across reloads and public routes", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Переключить тему" }).click()
    await expect(page.locator("html")).toHaveClass(/dark/)
    await expect.poll(() => page.evaluate(() => localStorage.getItem("theme"))).toBe("dark")

    await page.reload()
    await expect(page.locator("html")).toHaveClass(/dark/)
    await page.goto("/faq")
    await expect(page.locator("html")).toHaveClass(/dark/)
  })

  test("opens and closes an FAQ answer from the keyboard", async ({ page }) => {
    await page.goto("/faq")
    const question = page.locator("summary").filter({
      hasText: "Почему я могу оказаться должен не тому, кто за меня заплатил?",
    })
    const details = question.locator("xpath=..")
    const answer = page.getByText(/SLOPwise сводит вместе все расходы группы/)

    await question.focus()
    await page.keyboard.press("Enter")
    await expect(details).toHaveAttribute("open", "")
    await expect(answer).toBeVisible()
    await page.keyboard.press("Space")
    await expect(details).not.toHaveAttribute("open", "")
    await expect(answer).toBeHidden()
  })

  test("preserves the FAQ callback through login", async ({ page }) => {
    await page.goto("/faq")
    const publicNavigation = page.getByRole("navigation", { name: "Публичная навигация" })
    await publicNavigation.getByRole("link", { name: "Войти" }).click()
    await expect(page).toHaveURL(/\/login\?callbackUrl=(?:%2F|\/)faq$/)

    await page.getByLabel("Email").fill(users.alice.email)
    await page.getByLabel("Пароль").fill(password)
    await page.getByRole("button", { name: "Войти" }).click()
    await expect(page).toHaveURL(/\/faq$/)
    await expect(page.getByRole("navigation", { name: "Основная навигация" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Частые вопросы" })).toBeVisible()
  })

  test("exposes public navigation with a single descriptive landmark", async ({ page }) => {
    await page.goto("/")
    const navigation = page.getByRole("navigation", { name: "Публичная навигация" })
    await expect(navigation).toHaveCount(1)
    await expect(navigation.getByRole("link", { name: "FAQ", exact: true })).toHaveAttribute(
      "href",
      "/faq"
    )
    await expect(navigation.getByRole("link", { name: "Войти", exact: true })).toHaveAttribute(
      "href",
      "/login"
    )
  })
})
