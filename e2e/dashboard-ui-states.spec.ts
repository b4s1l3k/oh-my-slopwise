import { expect, test, type Route } from "@playwright/test"
import { login, users } from "./helpers"

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  })
}

test.describe("dashboard query states", () => {
  test("keeps placeholders visible until dashboard data has loaded", async ({ page }) => {
    let releaseRequests = () => {}
    const blocked = new Promise<void>((resolve) => {
      releaseRequests = resolve
    })

    await page.route("**/api/v1/groups", async (route) => {
      await blocked
      await fulfillJson(route, { groups: [] })
    })
    await page.route("**/api/v1/balances/overview", async (route) => {
      await blocked
      await fulfillJson(route, { totals: [], friendBalances: [] })
    })

    await login(page, users.alice)
    await expect(page.locator(".animate-pulse").first()).toBeVisible()

    releaseRequests()
    await expect(page.getByText("Все расчёты завершены 🎉", { exact: true })).toBeVisible()
    await expect(page.getByText("Групп пока нет", { exact: true })).toBeVisible()
    await expect(page.locator(".animate-pulse")).toHaveCount(0)
  })

  test("renders both empty dashboard calls to action", async ({ page }) => {
    await page.route("**/api/v1/groups", (route) => fulfillJson(route, { groups: [] }))
    await page.route("**/api/v1/balances/overview", (route) =>
      fulfillJson(route, { totals: [], friendBalances: [] })
    )

    await login(page, users.alice)

    await expect(page.getByText("Все расчёты завершены 🎉", { exact: true })).toBeVisible()
    await expect(page.getByText("Групп пока нет", { exact: true })).toBeVisible()
    const createLinks = page.getByRole("link", { name: /Создать/ })
    await expect(createLinks).toHaveCount(2)
    await expect(createLinks.first()).toHaveAttribute("href", "/groups/new")
    await expect(createLinks.last()).toHaveAttribute("href", "/groups/new")
  })

  test("shows a group-list error and recovers through retry", async ({ page }) => {
    let attempts = 0
    await page.route("**/api/v1/groups", async (route) => {
      attempts += 1
      if (attempts <= 2) {
        await fulfillJson(route, { error: { code: "INTERNAL_ERROR" } }, 500)
        return
      }
      await fulfillJson(route, { groups: [] })
    })
    await page.route("**/api/v1/balances/overview", (route) =>
      fulfillJson(route, { totals: [], friendBalances: [] })
    )

    await login(page, users.alice)
    const alert = page.getByRole("alert").filter({ hasText: "Не удалось загрузить группы" })
    await expect(alert).toBeVisible()
    await expect.poll(() => attempts).toBe(2)

    await alert.getByRole("button", { name: "Повторить" }).click()
    await expect(page.getByText("Групп пока нет", { exact: true })).toBeVisible()
    await expect(alert).toHaveCount(0)
    expect(attempts).toBe(3)
  })

  test("shows a balance error and recovers through retry", async ({ page }) => {
    let attempts = 0
    await page.route("**/api/v1/groups", (route) => fulfillJson(route, { groups: [] }))
    await page.route("**/api/v1/balances/overview", async (route) => {
      attempts += 1
      if (attempts <= 2) {
        await fulfillJson(route, { error: { code: "INTERNAL_ERROR" } }, 500)
        return
      }
      await fulfillJson(route, {
        totals: [{ currency: "RUB", owed: 12_345, owe: 0 }],
        friendBalances: [],
      })
    })

    await login(page, users.alice)
    const alert = page.getByRole("alert").filter({ hasText: "Не удалось загрузить баланс" })
    await expect(alert).toBeVisible()

    await alert.getByRole("button", { name: "Повторить" }).click()
    await expect(page.getByText(/123,45/)).toBeVisible()
    await expect(alert).toHaveCount(0)
    expect(attempts).toBe(3)
  })
})
