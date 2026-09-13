import { expect, test } from "@playwright/test"
import { createGroup, login, userId, users } from "./helpers"

test.describe("expense browser workflows", () => {
  test("creates an equal expense from the dialog and renders it without reload", async ({ page }) => {
    await login(page, users.alice)
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, { name: "UI Expense E2E", memberIds: [bobId] })
    await page.goto(`/groups/${groupId}`)

    await page.getByRole("button", { name: "Расход", exact: true }).click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await page.getByPlaceholder("Ужин в ресторане").fill("UI Dinner E2E")
    await page.getByPlaceholder("1200").fill("123.45")
    await page.getByLabel("Дата").fill("2026-09-13")
    await page.getByPlaceholder("...").fill("Browser-created note")
    await page.getByRole("button", { name: "Добавить расход" }).click()

    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(page.getByText("UI Dinner E2E", { exact: true })).toBeVisible()
    await expect(page.getByText("123,45 ₽", { exact: true })).toBeVisible()
  })

  test("shows client validation for empty amount and no participants", async ({ page }) => {
    await login(page, users.alice)
    const groupId = await createGroup(page, { name: "UI Validation E2E" })
    await page.goto(`/groups/${groupId}`)
    await page.getByRole("button", { name: "Расход", exact: true }).click()
    await page.getByRole("button", { name: "Добавить расход" }).click()
    await expect(page.getByText("Укажите корректную сумму")).toBeVisible()

    await page.getByPlaceholder("Ужин в ресторане").fill("No participants")
    await page.getByPlaceholder("1200").fill("10")
    await page.getByText(users.alice.name).locator("..").getByRole("button").click()
    await page.getByRole("button", { name: "Добавить расход" }).click()
    await expect(page.getByText("Выберите хотя бы одного участника")).toBeVisible()
  })

  test("creates an exact split and exposes server validation in a toast", async ({ page }) => {
    await login(page, users.alice)
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, { name: "UI Exact E2E", memberIds: [bobId] })
    await page.goto(`/groups/${groupId}`)
    await page.getByRole("button", { name: "Расход", exact: true }).click()
    await page.getByPlaceholder("Ужин в ресторане").fill("UI Exact")
    await page.getByPlaceholder("1200").fill("100")
    await page.getByRole("button", { name: "Суммы" }).click()
    const exactInputs = page.getByRole("dialog").locator('input[placeholder="0.00"]')
    await expect(exactInputs).toHaveCount(2)
    await exactInputs.nth(0).fill("40")
    await exactInputs.nth(1).fill("50")
    await page.getByRole("button", { name: "Добавить расход" }).click()
    await expect(page.getByText(/не равна сумме расхода/i)).toBeVisible()

    await exactInputs.nth(1).fill("60")
    await page.getByRole("button", { name: "Добавить расход" }).click()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(page.getByText("UI Exact", { exact: true })).toBeVisible()
  })
})
