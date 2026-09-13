import { expect, test } from "@playwright/test"
import { login, password, users } from "./helpers"

test.describe("authentication and navigation", () => {
  test("public pages render and protected pages preserve the callback", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { name: /Делите эмоции/ })).toBeVisible()
    await expect(page.getByRole("link", { name: "Начать бесплатно" })).toBeVisible()

    await page.goto("/faq")
    await expect(page.getByRole("heading", { name: /частые вопросы/i })).toBeVisible()

    await page.goto("/groups")
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fgroups$/)
  })

  test("rejects invalid credentials and signs a real user in", async ({ page }) => {
    await page.goto("/login")
    await page.getByLabel("Email").fill(users.alice.email)
    await page.getByLabel("Пароль").fill("wrong-password")
    await page.getByRole("button", { name: "Войти" }).click()
    await expect(page.getByText("Неверный email или пароль")).toBeVisible()
    await expect(page).toHaveURL(/\/login/)

    await page.getByLabel("Пароль").fill(password)
    await page.getByRole("button", { name: "Войти" }).click()
    await expect(page).toHaveURL(/\/(?:dashboard)?$/)
    await expect(page.getByRole("heading", { name: /Привет, Алиса/ })).toBeVisible()
  })

  test("registers, logs in automatically, validates duplicate and oversized passwords", async ({
    page,
  }) => {
    const email = "registered.e2e@example.com"
    await page.goto("/register")
    await page.getByLabel("Имя").fill("Новый E2E")
    await page.getByLabel("Email").fill(email)
    await page.getByLabel("Пароль").fill("Registered-123")
    await page.getByRole("button", { name: "Зарегистрироваться" }).click()
    await expect(page).toHaveURL(/\/(?:dashboard)?$/)
    await expect(page.getByRole("heading", { name: /Привет, Новый/ })).toBeVisible()

    await page.context().clearCookies()
    await page.goto("/register")
    await page.getByLabel("Имя").fill("Дубликат")
    await page.getByLabel("Email").fill(email)
    await page.getByLabel("Пароль").fill("Registered-123")
    await page.getByRole("button", { name: "Зарегистрироваться" }).click()
    await expect(page.getByText(/email уже существует/i)).toBeVisible()

    await page.getByLabel("Email").fill("long-password.e2e@example.com")
    await page.getByLabel("Пароль").fill("я".repeat(37))
    await page.getByRole("button", { name: "Зарегистрироваться" }).click()
    await expect(page.getByText(/не больше 72 байт/i)).toBeVisible()
  })

  test("admin page is role protected", async ({ browser }) => {
    const userPage = await browser.newPage()
    await login(userPage, users.bob)
    await userPage.goto("/admin/feedback")
    await expect(userPage).toHaveURL(/\/dashboard$/)
    await userPage.close()

    const adminPage = await browser.newPage()
    await login(adminPage, users.admin)
    await adminPage.goto("/admin/feedback")
    await expect(adminPage.getByRole("heading", { name: "Обратная связь" })).toBeVisible()
    await adminPage.close()
  })
})
