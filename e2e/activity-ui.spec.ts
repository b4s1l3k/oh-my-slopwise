import { expect, test } from "@playwright/test"
import { apiJson, createGroup, login, userId, users } from "./helpers"

test.describe("activity browser workflow", () => {
  test("renders a cross-feature activity timeline", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, { name: "Activity E2E", memberIds: [bobId] })
    const expense = await apiJson<{ expense: { id: string } }>(
      page,
      `/api/v1/groups/${groupId}/expenses`,
      {
        method: "POST",
        expectedStatus: 201,
        body: {
          title: "Activity Expense",
          amount: 1_000,
          currency: "RUB",
          date: "2026-09-13",
          paidById: aliceId,
          splitType: "EQUAL",
          splits: [{ userId: aliceId }, { userId: bobId }],
        },
      }
    )
    await apiJson(page, `/api/v1/expenses/${expense.expense.id}`, {
      method: "PATCH",
      body: {
        title: "Activity Expense Updated",
        amount: 1_000,
        currency: "RUB",
        date: "2026-09-14",
        paidById: aliceId,
        splitType: "EQUAL",
        splits: [{ userId: aliceId }, { userId: bobId }],
      },
    })

    await page.goto("/activity")
    await expect(page.getByRole("heading", { name: "Activity E2E" })).toBeVisible()
    await expect(page.getByText(/добавил.*Activity Expense/i)).toBeVisible()
    await expect(page.getByText(/изменил.*Activity Expense Updated/i)).toBeVisible()
  })
})
