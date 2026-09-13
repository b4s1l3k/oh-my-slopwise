import { expect, test, type Page, type Route } from "@playwright/test"
import { createGroup, login, password, users } from "./helpers"

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
}

async function loginTo(page: Page, path: string): Promise<void> {
  await page.goto(`/login?callbackUrl=${encodeURIComponent(path)}`)
  await page.getByLabel("Email").fill(users.alice.email)
  await page.getByLabel("Пароль").fill(password)
  await page.getByRole("button", { name: "Войти" }).click()
  await expect(page).toHaveURL(new RegExp(`${path}$`))
}

test.describe("query page recovery", () => {
  test("retries the groups page after an API failure", async ({ page }) => {
    let attempts = 0
    let recover = false
    await page.route("**/api/v1/groups", async (route) => {
      attempts += 1
      if (!recover) {
        await fulfillJson(route, { error: { code: "INTERNAL_ERROR" } }, 500)
        return
      }
      await fulfillJson(route, { groups: [] })
    })

    await loginTo(page, "/groups")
    const alert = page.getByRole("alert").filter({ hasText: "Не удалось загрузить группы" })
    await expect(alert).toBeVisible()

    const failedAttempts = attempts
    recover = true
    await alert.getByRole("button", { name: "Повторить" }).click()
    await expect(page.getByText("Нет групп", { exact: true })).toBeVisible()
    await expect(alert).toHaveCount(0)
    expect(attempts).toBe(failedAttempts + 1)
  })

  test("retries the activity page after its group query fails", async ({ page }) => {
    let attempts = 0
    let recover = false
    await page.route("**/api/v1/groups", async (route) => {
      attempts += 1
      if (!recover) {
        await fulfillJson(route, { error: { code: "INTERNAL_ERROR" } }, 500)
        return
      }
      await fulfillJson(route, { groups: [] })
    })

    await loginTo(page, "/activity")
    const alert = page.getByRole("alert").filter({ hasText: "Не удалось загрузить активность" })
    await expect(alert).toBeVisible()

    const failedAttempts = attempts
    recover = true
    await alert.getByRole("button", { name: "Повторить" }).click()
    await expect(page.getByText("Активности пока нет", { exact: true })).toBeVisible()
    await expect(alert).toHaveCount(0)
    expect(attempts).toBe(failedAttempts + 1)
  })

  test("retries the admin feedback page after an API failure", async ({ page }) => {
    let attempts = 0
    await page.route("**/api/v1/admin/feedback", async (route) => {
      attempts += 1
      if (attempts <= 2) {
        await fulfillJson(route, { error: { code: "INTERNAL_ERROR" } }, 500)
        return
      }
      await fulfillJson(route, { feedbacks: [] })
    })

    await login(page, users.admin)
    await page.goto("/admin/feedback")
    const alert = page.getByRole("alert").filter({
      hasText: "Не удалось загрузить обратную связь",
    })
    await expect(alert).toBeVisible()

    await alert.getByRole("button", { name: "Повторить" }).click()
    await expect(page.getByText("Обратной связи пока нет", { exact: true })).toBeVisible()
    await expect(alert).toHaveCount(0)
    expect(attempts).toBe(3)
  })

  test("retries a failed group deep link", async ({ page }) => {
    await login(page, users.alice)
    const groupId = await createGroup(page, { name: "Group Deep Link Retry E2E" })
    let attempts = 0
    await page.route(`**/api/v1/groups/${groupId}`, async (route) => {
      attempts += 1
      if (attempts <= 2) {
        await fulfillJson(route, { error: { code: "INTERNAL_ERROR" } }, 500)
        return
      }
      await route.continue()
    })

    await page.goto(`/groups/${groupId}`)
    const alert = page.getByRole("alert").filter({ hasText: "Не удалось загрузить группу" })
    await expect(alert).toBeVisible()

    await alert.getByRole("button", { name: "Повторить" }).click()
    await expect(page.getByRole("heading", { name: "Group Deep Link Retry E2E" })).toBeVisible()
    await expect(alert).toHaveCount(0)
    expect(attempts).toBe(3)
  })

  test("renders a stable not-found state for an unknown group deep link", async ({ page }) => {
    await login(page, users.alice)
    await page.route("**/api/v1/groups/missing-ui-group", (route) =>
      fulfillJson(route, { error: { code: "GROUP_NOT_FOUND" } }, 404)
    )

    await page.goto("/groups/missing-ui-group")
    await expect(page.getByText("Группа не найдена", { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Повторить" })).toHaveCount(0)
  })

  test("retries a failed group settings deep link", async ({ page }) => {
    await login(page, users.alice)
    const groupId = await createGroup(page, { name: "Settings Deep Link Retry E2E" })
    let attempts = 0
    await page.route(`**/api/v1/groups/${groupId}`, async (route) => {
      attempts += 1
      if (attempts <= 2) {
        await fulfillJson(route, { error: { code: "INTERNAL_ERROR" } }, 500)
        return
      }
      await route.continue()
    })

    await page.goto(`/groups/${groupId}/settings`)
    const alert = page.getByRole("alert").filter({
      hasText: "Не удалось загрузить настройки группы",
    })
    await expect(alert).toBeVisible()

    await alert.getByRole("button", { name: "Повторить" }).click()
    await expect(page.getByRole("heading", { name: "Настройки группы" })).toBeVisible()
    await expect(page.locator("input").first()).toHaveValue("Settings Deep Link Retry E2E")
    expect(attempts).toBe(3)
  })

  test("recovers group balances and expenses independently", async ({ page }) => {
    await login(page, users.alice)
    const groupId = await createGroup(page, { name: "Group Subqueries Retry E2E" })
    let balanceAttempts = 0
    let expenseAttempts = 0
    await page.route(`**/api/v1/groups/${groupId}/balances`, async (route) => {
      balanceAttempts += 1
      if (balanceAttempts <= 2) {
        await fulfillJson(route, { error: { code: "INTERNAL_ERROR" } }, 500)
        return
      }
      await route.continue()
    })
    await page.route(`**/api/v1/groups/${groupId}/expenses?*`, async (route) => {
      expenseAttempts += 1
      if (expenseAttempts <= 2) {
        await fulfillJson(route, { error: { code: "INTERNAL_ERROR" } }, 500)
        return
      }
      await route.continue()
    })

    await page.goto(`/groups/${groupId}`)
    const balanceAlert = page.getByRole("alert").filter({ hasText: "Не удалось загрузить долги" })
    const expenseAlert = page.getByRole("alert").filter({ hasText: "Не удалось загрузить расходы" })
    await expect(balanceAlert).toBeVisible()
    await expect(expenseAlert).toBeVisible()

    await balanceAlert.getByRole("button", { name: "Повторить" }).click()
    await expect(page.getByText("Все расчёты завершены!", { exact: true })).toBeVisible()
    await expenseAlert.getByRole("button", { name: "Повторить" }).click()
    await expect(page.getByText("Расходов пока нет", { exact: true })).toBeVisible()
    expect(balanceAttempts).toBe(3)
    expect(expenseAttempts).toBe(3)
  })
})
