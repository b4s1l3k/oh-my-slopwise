import { expect, test, type Route } from "@playwright/test"
import { login, users } from "./helpers"

const profile = {
  id: "profile-e2e-user",
  name: users.alice.name,
  email: users.alice.email,
  avatarUrl: null,
  payeeName: "Алиса Тестовая",
  bankName: "Альфа Тест",
  payeeAccount: "+79990000002",
  createdAt: "2026-01-02T10:00:00.000Z",
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  })
}

test.describe("profile error recovery", () => {
  test("retries a failed profile load without leaving an empty editable form", async ({ page }) => {
    let attempts = 0
    await page.route("**/api/v1/users/me", async (route) => {
      attempts += 1
      if (attempts <= 2) {
        await fulfillJson(route, { error: { code: "INTERNAL_ERROR" } }, 500)
        return
      }
      await fulfillJson(route, { user: profile })
    })

    await login(page, users.alice)
    await page.goto("/profile")

    const alert = page.getByRole("alert").filter({ hasText: "Не удалось загрузить профиль" })
    await expect(alert).toBeVisible()
    await expect(page.getByLabel("Имя", { exact: true })).toHaveCount(0)

    await alert.getByRole("button", { name: "Повторить" }).click()
    await expect(page.getByLabel("Имя", { exact: true })).toHaveValue(users.alice.name)
    await expect(alert).toHaveCount(0)
    expect(attempts).toBe(3)
  })

  for (const { status, message } of [
    { status: 401, message: "Сессия истекла" },
    { status: 403, message: "Изменение профиля запрещено" },
    { status: 404, message: "Профиль не найден" },
    { status: 422, message: "Имя не прошло проверку" },
    { status: 500, message: "Сервис профиля недоступен" },
  ]) {
    test(`preserves profile edits after a ${status} response`, async ({ page }) => {
      await page.route("**/api/v1/users/me", async (route) => {
        if (route.request().method() === "GET") {
          await fulfillJson(route, { user: profile })
          return
        }
        await fulfillJson(route, { error: { code: `HTTP_${status}`, message } }, status)
      })

      await login(page, users.alice)
      await page.goto("/profile")
      const name = page.getByLabel("Имя", { exact: true })
      await name.fill("Несохранённое имя")
      await page.getByRole("button", { name: "Сохранить", exact: true }).click()

      await expect(page.getByText(message, { exact: true })).toBeVisible()
      await expect(name).toHaveValue("Несохранённое имя")
      await expect(page).toHaveURL(/\/profile$/)
    })
  }

  test("preserves profile edits after a network failure", async ({ page }) => {
    await page.route("**/api/v1/users/me", async (route) => {
      if (route.request().method() === "GET") {
        await fulfillJson(route, { user: profile })
        return
      }
      await route.abort("failed")
    })

    await login(page, users.alice)
    await page.goto("/profile")
    const name = page.getByLabel("Имя", { exact: true })
    await name.fill("Имя после обрыва сети")
    await page.getByRole("button", { name: "Сохранить", exact: true }).click()

    await expect(page.getByText("Не удалось сохранить", { exact: true })).toBeVisible()
    await expect(name).toHaveValue("Имя после обрыва сети")
  })

  test("disables profile submission while a request is pending", async ({ page }) => {
    let releaseRequest = () => {}
    const blocked = new Promise<void>((resolve) => {
      releaseRequest = resolve
    })
    let patchRequests = 0
    let currentName: string = profile.name

    await page.route("**/api/v1/users/me", async (route) => {
      if (route.request().method() === "GET") {
        await fulfillJson(route, { user: { ...profile, name: currentName } })
        return
      }
      patchRequests += 1
      const body = route.request().postDataJSON() as { name: string }
      currentName = body.name
      await blocked
      await fulfillJson(route, { user: { ...profile, name: currentName } })
    })

    await login(page, users.alice)
    await page.goto("/profile")
    await page.getByLabel("Имя", { exact: true }).fill("Один запрос")
    const save = page.getByRole("button", { name: "Сохранить", exact: true })
    await save.click()

    await expect(save).toBeDisabled()
    expect(patchRequests).toBe(1)
    releaseRequest()
    await expect(page.getByText("Профиль сохранён", { exact: true })).toBeVisible()
    await expect(save).toBeEnabled()
    expect(patchRequests).toBe(1)
  })
})
