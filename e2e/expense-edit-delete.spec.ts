import { expect, test } from "@playwright/test"
import { apiJson, createExpense, createGroup, login, userId, users } from "./helpers"

test.describe("expense editing and deletion", () => {
  test("edits an expense through the UI and preserves the business date", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const groupId = await createGroup(page, { name: "UI Edit E2E" })
    await createExpense(page, groupId, {
      title: "Before UI Edit",
      amount: 1_000,
      currency: "RUB",
      date: "2026-03-29",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }],
    })

    await page.goto(`/groups/${groupId}`)
    await page.getByTitle("Редактировать").click()
    const dialog = page.getByRole("dialog")
    await dialog.getByPlaceholder("Ужин в ресторане").fill("After UI Edit")
    await dialog.getByLabel("Дата").fill("2026-10-25")
    await dialog.getByRole("button", { name: "Сохранить изменения" }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByText("After UI Edit")).toBeVisible()

    const listed = await apiJson<{ expenses: Array<{ title: string; date: string }> }>(
      page,
      `/api/v1/groups/${groupId}/expenses`
    )
    expect(listed.expenses[0]).toMatchObject({
      title: "After UI Edit",
      date: expect.stringMatching(/^2026-10-25/),
    })
  })

  test("deletes an expense and updates the empty state", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const groupId = await createGroup(page, { name: "UI Delete Expense E2E" })
    await createExpense(page, groupId, {
      title: "Delete Me E2E",
      amount: 1_000,
      currency: "RUB",
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }],
    })
    await page.goto(`/groups/${groupId}`)
    page.once("dialog", (dialog) => dialog.accept())
    await page.getByTitle("Удалить", { exact: true }).click()
    await expect(page.getByText("Расход удалён")).toBeVisible()
    await expect(page.getByText("Расходов пока нет")).toBeVisible()
  })
})
