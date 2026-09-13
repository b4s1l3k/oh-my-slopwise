import { expect, test } from "@playwright/test"
import { login, users } from "./helpers"

test.describe("desktop application navigation", () => {
  test("exposes every user destination and navigates through the sidebar", async ({ page }) => {
    await login(page, users.alice)
    await page.goto("/dashboard")

    for (const name of ["Обзор", "Группы", "Активность", "Профиль", "Частые вопросы", "Обратная связь"]) {
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible()
    }

    await page.getByRole("link", { name: "Активность", exact: true }).click()
    await expect(page).toHaveURL(/\/activity$/)
    await page.getByRole("link", { name: "Обратная связь", exact: true }).click()
    await expect(page).toHaveURL(/\/feedback$/)
    await page.getByRole("link", { name: "Частые вопросы", exact: true }).click()
    await expect(page).toHaveURL(/\/faq$/)
  })

  test("shows the admin panel destination only to an admin", async ({ page }) => {
    await login(page, users.admin)
    await page.goto("/dashboard")

    await expect(page.getByRole("link", { name: "Админ-панель", exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "Обратная связь", exact: true })).toHaveCount(0)
    await page.getByRole("link", { name: "Админ-панель", exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/feedback$/)
  })
})
