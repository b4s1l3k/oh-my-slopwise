import { expect, test } from "@playwright/test"
import { login, users } from "./helpers"

test.describe("profile settings", () => {
  test("shows the authenticated identity and stored requisites", async ({ page }) => {
    await login(page, users.alice)
    await page.goto("/profile")

    await expect(page.getByRole("heading", { name: "Профиль", exact: true })).toBeVisible()
    await expect(page.getByLabel("Имя", { exact: true })).toHaveValue(users.alice.name)
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue(users.alice.email)
    await expect(page.getByLabel("Email", { exact: true })).toBeDisabled()
    await expect(page.getByLabel("ФИО получателя")).toHaveValue("Алиса Тестовая")
    await expect(page.getByLabel("Банк", { exact: true })).toHaveValue("Альфа Тест")
    await expect(page.getByLabel("Номер карты / телефона")).toHaveValue("+79990000002")
  })

  test("updates profile, keeps values after reload and can restore them", async ({ page }) => {
    await login(page, users.carol)
    await page.goto("/profile")

    await page.getByLabel("Имя", { exact: true }).fill("Карина Обновлённая")
    await page.getByLabel("ФИО получателя").fill("Карина Получатель")
    await page.getByLabel("Банк", { exact: true }).fill("Карина Банк")
    await page.getByLabel("Номер карты / телефона").fill("CAROL-ACCOUNT")
    await page.getByRole("button", { name: "Сохранить" }).click()
    await expect(page.getByText("Профиль сохранён", { exact: true })).toBeVisible()

    await page.reload()
    await expect(page.getByLabel("Имя", { exact: true })).toHaveValue("Карина Обновлённая")
    await expect(page.getByLabel("ФИО получателя")).toHaveValue("Карина Получатель")
    await expect(page.getByLabel("Банк", { exact: true })).toHaveValue("Карина Банк")
    await expect(page.getByLabel("Номер карты / телефона")).toHaveValue("CAROL-ACCOUNT")

    await page.getByLabel("Имя", { exact: true }).fill(users.carol.name)
    await page.getByLabel("ФИО получателя").fill("")
    await page.getByLabel("Банк", { exact: true }).fill("")
    await page.getByLabel("Номер карты / телефона").fill("")
    await page.getByRole("button", { name: "Сохранить" }).click()
    await expect(page.getByText("Профиль сохранён", { exact: true })).toBeVisible()
  })

  test("shows a controlled validation error and preserves the last valid name", async ({ page }) => {
    await login(page, users.alice)
    await page.goto("/profile")

    await page.getByLabel("Имя", { exact: true }).fill("")
    await page.getByRole("button", { name: "Сохранить" }).click()
    await expect(page.getByText("Имя обязательно", { exact: true })).toBeVisible()

    await page.reload()
    await expect(page.getByLabel("Имя", { exact: true })).toHaveValue(users.alice.name)
  })
})
