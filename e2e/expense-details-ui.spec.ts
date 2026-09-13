import { expect, test } from "@playwright/test"
import { apiJson, createExpense, createGroup, login, userId, users } from "./helpers"

test.describe("expense details browser workflow", () => {
  test("expands percentage, FX, cash and notes details for an expense", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, {
      name: "Expanded PLN Expense Details E2E",
      memberIds: [bobId],
      currency: "RUB",
      type: "TRIP",
    })
    const customRate = 25
    await createExpense(page, groupId, {
      title: "Expanded PLN Percentage Expense E2E",
      amount: 10_000,
      currency: "PLN",
      customRate,
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "PERCENTAGE",
      splits: [
        { userId: aliceId, percentage: 4_000 },
        { userId: bobId, percentage: 6_000 },
      ],
      cashPayments: [{ userId: bobId, amount: 2_000 }],
      notes: "Expanded financial details note E2E",
    })

    await page.goto(`/groups/${groupId}`)
    await page.getByRole("button", { name: "Подробнее" }).click()

    await expect(page.getByRole("button", { name: "Скрыть детали" })).toBeVisible()
    await expect(page.getByText("40%", { exact: true })).toBeVisible()
    await expect(page.getByText("60%", { exact: true })).toBeVisible()
    await expect(
      page.getByText(new RegExp(`Курс: 1 PLN =\\s*${customRate} RUB\\s*·\\s*вручную`))
    ).toBeVisible()
    await expect(
      page.getByText(/отдал\(а\) наличными\s+20(?:[,.]00)?\s+PLN\s+в моменте/)
    ).toBeVisible()
    await expect(page.getByText(/осталось\s+40(?:[,.]00)?\s+PLN/)).toBeVisible()
    await expect(page.getByText("Expanded financial details note E2E", { exact: true })).toBeVisible()
  })
})
