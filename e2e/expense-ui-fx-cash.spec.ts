import { expect, test } from "@playwright/test"
import { apiJson, createGroup, login, userId, users } from "./helpers"

test.describe("FX and cash expense browser workflows", () => {
  test("creates an FX expense with a manual rate through the dialog", async ({ page }) => {
    await login(page, users.alice)
    const groupId = await createGroup(page, { name: "UI FX Expense E2E" })
    await page.goto(`/groups/${groupId}`)

    await page.getByRole("button", { name: "Расход", exact: true }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByPlaceholder("Ужин в ресторане").fill("UI Manual FX")
    await dialog.getByPlaceholder("1200").fill("10")
    await dialog.getByRole("button", { name: /RUB/ }).click()
    await page.getByRole("button", { name: /USD.*Доллар США/ }).click()
    await dialog.getByPlaceholder("по курсу ЦБ").fill("92.5")
    await expect(dialog.getByText(/≈ 925\.00 ₽/)).toBeVisible()
    await dialog.getByRole("button", { name: "Добавить расход" }).click()

    await expect(dialog).toHaveCount(0)
    await expect(page.getByText("UI Manual FX")).toBeVisible()
    const listed = await apiJson<{
      expenses: Array<{
        title: string
        currency: string
        amount: number
        amountBase: number | null
        customRate: number | null
      }>
    }>(page, `/api/v1/groups/${groupId}/expenses`)
    expect(listed.expenses.find((expense) => expense.title === "UI Manual FX")).toMatchObject({
      currency: "USD",
      amount: 1_000,
      amountBase: 92_500,
      customRate: 92.5,
    })
  })

  test("records a partial cash return through the expense dialog", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, {
      name: "UI Cash Expense E2E",
      memberIds: [bobId],
    })
    await page.goto(`/groups/${groupId}`)

    await page.getByRole("button", { name: "Расход", exact: true }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByPlaceholder("Ужин в ресторане").fill("UI Cash Return")
    await dialog.getByPlaceholder("1200").fill("100")
    await dialog.getByRole("button", { name: /Уже заплатили наличными/ }).click()
    await dialog.locator('input[placeholder="0.00"]').fill("20")
    await dialog.getByRole("button", { name: "Добавить расход" }).click()

    await expect(dialog).toHaveCount(0)
    await expect(page.getByText("UI Cash Return")).toBeVisible()
    const listed = await apiJson<{
      expenses: Array<{
        title: string
        settlements: Array<{ amount: number; currency: string }>
      }>
    }>(page, `/api/v1/groups/${groupId}/expenses`)
    expect(listed.expenses.find((expense) => expense.title === "UI Cash Return")).toMatchObject({
      settlements: [{ amount: 2_000, currency: "RUB" }],
    })

    const balance = await apiJson<{
      balances: { simplified: Array<{ fromUserId: string; toUserId: string; amount: number }> }
    }>(page, `/api/v1/groups/${groupId}/balances`)
    expect(balance.balances.simplified).toEqual([{
      fromUserId: bobId,
      toUserId: aliceId,
      fromUserName: users.bob.name,
      toUserName: users.alice.name,
      amount: 3_000,
    }])
  })
})
