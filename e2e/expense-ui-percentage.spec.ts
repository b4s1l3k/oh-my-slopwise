import { expect, test } from "@playwright/test"
import { apiJson, createGroup, login, userId, users } from "./helpers"

test.describe("percentage expense browser workflow", () => {
  test("creates a percentage split through the dialog", async ({ page }) => {
    await login(page, users.alice)
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, {
      name: "UI Percentage Expense E2E",
      memberIds: [bobId],
    })
    await page.goto(`/groups/${groupId}`)

    await page.getByRole("button", { name: "Расход", exact: true }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByPlaceholder("Ужин в ресторане").fill("UI Percentage")
    await dialog.getByPlaceholder("1200").fill("100")
    await dialog.getByRole("button", { name: "Проценты" }).click()
    const percentageInputs = dialog.locator('input[placeholder="0"]')
    await expect(percentageInputs).toHaveCount(2)
    await percentageInputs.nth(0).fill("40")
    await percentageInputs.nth(1).fill("60")
    await dialog.getByRole("button", { name: "Добавить расход" }).click()

    await expect(dialog).toHaveCount(0)
    await expect(page.getByText("UI Percentage", { exact: true })).toBeVisible()
    const listed = await apiJson<{
      expenses: Array<{
        title: string
        splitType: string
        splits: Array<{ amount: number; percentage: number | null }>
      }>
    }>(page, `/api/v1/groups/${groupId}/expenses`)
    const created = listed.expenses.find((expense) => expense.title === "UI Percentage")
    expect(created).toMatchObject({
      splitType: "PERCENTAGE",
      splits: [
        { amount: 4_000, percentage: 4_000 },
        { amount: 6_000, percentage: 6_000 },
      ],
    })
  })
})
