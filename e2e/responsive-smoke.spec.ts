import { expect, test } from "@playwright/test"
import { login, users } from "./helpers"

test.describe("responsive application shell", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("renders mobile navigation and all primary destinations", async ({ page }) => {
    await login(page, users.alice)
    await page.goto("/dashboard")
    await expect(page.getByRole("link", { name: "Обзор", exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "Группы", exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "События", exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "Профиль", exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "FAQ", exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "Отзыв", exact: true })).toBeVisible()

    await page.getByRole("link", { name: "Группы", exact: true }).click()
    await expect(page).toHaveURL(/\/groups$/)
    await page.getByRole("link", { name: "Профиль", exact: true }).click()
    await expect(page).toHaveURL(/\/profile$/)
  })

  test("shows the admin destination instead of user feedback for an admin", async ({ page }) => {
    await login(page, users.admin)
    await page.goto("/dashboard")

    await expect(page.getByRole("link", { name: "Админ", exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "Отзыв", exact: true })).toHaveCount(0)
    await page.getByRole("link", { name: "Админ", exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/feedback$/)
  })
})
