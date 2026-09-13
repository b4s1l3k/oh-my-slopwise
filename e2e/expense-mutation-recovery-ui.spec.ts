import { expect, test, type Route } from "@playwright/test"
import { apiJson, createExpense, createGroup, login, users } from "./helpers"

async function failJson(route: Route, message: string): Promise<void> {
  await route.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }),
  })
}

test.describe("expense mutation recovery UI", () => {
  test("preserves a new expense draft after failure and creates exactly one expense on retry", async ({ page }) => {
    await login(page, users.alice)
    const groupId = await createGroup(page, { name: "Expense Create Recovery E2E" })
    let createAttempts = 0
    await page.route(`**/api/v1/groups/${groupId}/expenses`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue()
        return
      }
      createAttempts += 1
      if (createAttempts === 1) {
        await failJson(route, "Expense create temporarily unavailable")
        return
      }
      await route.continue()
    })

    await page.goto(`/groups/${groupId}`)
    await page.getByRole("button", { name: "Расход", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Новый расход" })
    await dialog.getByLabel("Название *").fill("Retry Expense UI E2E")
    await dialog.getByLabel("Сумма траты *").fill("123.45")
    await dialog.getByLabel("Дата", { exact: true }).fill("2026-09-13")
    await dialog.getByLabel("Заметка (необязательно)").fill("Draft must survive")
    await dialog.getByRole("button", { name: "Добавить расход" }).click()

    await expect(page.getByText("Expense create temporarily unavailable", { exact: true })).toBeVisible()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel("Название *")).toHaveValue("Retry Expense UI E2E")
    await expect(dialog.getByLabel("Сумма траты *")).toHaveValue("123.45")
    await expect(dialog.getByLabel("Заметка (необязательно)")).toHaveValue("Draft must survive")

    await dialog.getByRole("button", { name: "Добавить расход" }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByText("Retry Expense UI E2E", { exact: true })).toBeVisible()
    const listed = await apiJson<{ expenses: Array<{ title: string; amount: number; notes: string | null }> }>(
      page,
      `/api/v1/groups/${groupId}/expenses`
    )
    expect(listed.expenses.filter((expense) => expense.title === "Retry Expense UI E2E"))
      .toHaveLength(1)
    expect(listed.expenses.find((expense) => expense.title === "Retry Expense UI E2E"))
      .toMatchObject({ title: "Retry Expense UI E2E", amount: 12_345, notes: "Draft must survive" })
    expect(createAttempts).toBe(2)
  })

  test("keeps an expense edit dialog open after failure and persists the corrected draft on retry", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const groupId = await createGroup(page, { name: "Expense Edit Recovery E2E" })
    const expense = await createExpense(page, groupId, {
      title: "Original recoverable expense",
      amount: 1_000,
      currency: "RUB",
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }],
    })
    let updateAttempts = 0
    await page.route(`**/api/v1/expenses/${expense.id}`, async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.continue()
        return
      }
      updateAttempts += 1
      if (updateAttempts === 1) {
        await failJson(route, "Expense update temporarily unavailable")
        return
      }
      await route.continue()
    })

    await page.goto(`/groups/${groupId}`)
    await page.getByTitle("Редактировать").click()
    const dialog = page.getByRole("dialog", { name: "Редактировать расход" })
    await dialog.getByLabel("Название *").fill("Recovered expense edit")
    await dialog.getByLabel("Сумма траты *").fill("25.50")
    await dialog.getByLabel("Дата", { exact: true }).fill("2026-10-25")
    await dialog.getByRole("button", { name: "Сохранить изменения" }).click()

    await expect(page.getByText("Expense update temporarily unavailable", { exact: true })).toBeVisible()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel("Название *")).toHaveValue("Recovered expense edit")
    await expect(dialog.getByLabel("Сумма траты *")).toHaveValue("25.50")
    await dialog.getByRole("button", { name: "Сохранить изменения" }).click()

    await expect(dialog).toHaveCount(0)
    const updated = await apiJson<{ expense: { title: string; amount: number; date: string } }>(
      page,
      `/api/v1/expenses/${expense.id}`
    )
    expect(updated.expense).toMatchObject({
      title: "Recovered expense edit",
      amount: 2_550,
      date: expect.stringMatching(/^2026-10-25/),
    })
    expect(updateAttempts).toBe(2)
  })

  test("does not hide an expense after failed deletion and deletes it on the next confirmation", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const groupId = await createGroup(page, { name: "Expense Delete Recovery E2E" })
    const expense = await createExpense(page, groupId, {
      title: "Recoverable deletion",
      amount: 1_000,
      currency: "RUB",
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }],
    })
    let deleteAttempts = 0
    await page.route(`**/api/v1/expenses/${expense.id}`, async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.continue()
        return
      }
      deleteAttempts += 1
      if (deleteAttempts === 1) {
        await failJson(route, "Delete temporarily unavailable")
        return
      }
      await route.continue()
    })

    await page.goto(`/groups/${groupId}`)
    page.on("dialog", (dialog) => dialog.accept())
    await page.getByTitle("Удалить", { exact: true }).click()
    await expect(page.getByText("Ошибка удаления", { exact: true })).toBeVisible()
    await expect(page.getByText("Recoverable deletion", { exact: true })).toBeVisible()

    await page.getByTitle("Удалить", { exact: true }).click()
    await expect(page.getByText("Recoverable deletion", { exact: true })).toHaveCount(0)
    expect((await page.request.get(`/api/v1/expenses/${expense.id}`)).status()).toBe(404)
    expect(deleteAttempts).toBe(2)
  })
})
