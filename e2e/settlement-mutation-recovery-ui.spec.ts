import { expect, test, type Route } from "@playwright/test"
import {
  apiJson,
  authenticatedContext,
  createExpense,
  createGroup,
  userId,
  users,
} from "./helpers"

async function failJson(route: Route, message: string): Promise<void> {
  await route.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }),
  })
}

test.describe("settlement mutation recovery UI", () => {
  test("preserves settlement fields after failure and clears the debt on retry", async ({ browser }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const aliceId = (await apiJson<{ user: { id: string } }>(alicePage, "/api/v1/users/me")).user.id
    const bobId = await userId(alicePage, "Боб")
    const groupId = await createGroup(alicePage, {
      name: "Settlement Recovery E2E",
      memberIds: [bobId],
    })
    await createExpense(alicePage, groupId, {
      title: "Debt for settlement retry",
      amount: 10_000,
      currency: "RUB",
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }, { userId: bobId }],
    })

    const bobContext = await authenticatedContext(browser, users.bob)
    const bobPage = bobContext.pages()[0]
    let attempts = 0
    await bobPage.route("**/api/v1/settlements", async (route) => {
      attempts += 1
      if (attempts === 1) {
        await failJson(route, "Settlement temporarily unavailable")
        return
      }
      await route.continue()
    })

    await bobPage.goto(`/groups/${groupId}`)
    await bobPage.getByRole("button", { name: "Оплатить" }).click()
    const dialog = bobPage.getByRole("dialog", { name: /Рассчитаться с/ })
    await dialog.getByLabel("Сумма", { exact: true }).fill("30.00")
    await dialog.getByLabel("Дата", { exact: true }).fill("2026-10-25")
    await dialog.getByLabel("Заметка (необязательно)").fill("Retry settlement note")
    await dialog.getByRole("button", { name: "Зафиксировать расчёт" }).click()

    await expect(bobPage.getByText("Settlement temporarily unavailable", { exact: true })).toBeVisible()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel("Сумма", { exact: true })).toHaveValue("30.00")
    await expect(dialog.getByLabel("Дата", { exact: true })).toHaveValue("2026-10-25")
    await expect(dialog.getByLabel("Заметка (необязательно)")).toHaveValue("Retry settlement note")

    await dialog.getByRole("button", { name: "Зафиксировать расчёт" }).click()
    await expect(dialog).toHaveCount(0)
    const listed = await apiJson<{
      settlements: Array<{ amount: number; date: string; notes: string | null }>
    }>(bobPage, `/api/v1/groups/${groupId}/settlements`)
    expect(listed.settlements).toContainEqual(expect.objectContaining({
      amount: 3_000,
      date: expect.stringMatching(/^2026-10-25/),
      notes: "Retry settlement note",
    }))
    const balances = await apiJson<{
      balances: { simplified: Array<{ amount: number }> }
    }>(bobPage, `/api/v1/groups/${groupId}/balances`)
    expect(balances.balances.simplified).toContainEqual(expect.objectContaining({ amount: 2_000 }))
    expect(attempts).toBe(2)

    await bobContext.close()
    await aliceContext.close()
  })

  test("keeps debts unchanged after a failed reset and retries from the same page", async ({ browser }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const aliceId = (await apiJson<{ user: { id: string } }>(alicePage, "/api/v1/users/me")).user.id
    const bobId = await userId(alicePage, "Боб")
    const groupId = await createGroup(alicePage, {
      name: "Settlement Reset Recovery E2E",
      memberIds: [bobId],
    })
    await createExpense(alicePage, groupId, {
      title: "Debt for reset retry",
      amount: 10_000,
      currency: "RUB",
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }, { userId: bobId }],
    })
    const bobContext = await authenticatedContext(browser, users.bob)
    const bobPage = bobContext.pages()[0]
    await apiJson(bobPage, "/api/v1/settlements", {
      method: "POST",
      expectedStatus: 201,
      body: {
        groupId,
        toUserId: aliceId,
        amount: 2_000,
        currency: "RUB",
        date: "2026-09-13",
      },
    })
    const before = await apiJson(alicePage, `/api/v1/groups/${groupId}/balances`)

    let attempts = 0
    await alicePage.route(`**/api/v1/groups/${groupId}/settlements`, async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.continue()
        return
      }
      attempts += 1
      if (attempts === 1) {
        await failJson(route, "Reset temporarily unavailable")
        return
      }
      await route.continue()
    })
    await alicePage.goto(`/groups/${groupId}`)
    alicePage.on("dialog", (dialog) => dialog.accept())
    await alicePage.getByRole("button", { name: "Пересчитать" }).click()
    await expect(alicePage.getByText("Reset temporarily unavailable", { exact: true })).toBeVisible()
    expect(await apiJson(alicePage, `/api/v1/groups/${groupId}/balances`)).toEqual(before)

    await alicePage.getByRole("button", { name: "Пересчитать" }).click()
    await expect(alicePage.getByText("Расчёты сброшены (1)", { exact: true })).toBeVisible()
    const after = await apiJson<{
      balances: { simplified: Array<{ amount: number }> }
    }>(alicePage, `/api/v1/groups/${groupId}/balances`)
    expect(after.balances.simplified).toContainEqual(expect.objectContaining({ amount: 5_000 }))
    expect(attempts).toBe(2)

    await bobContext.close()
    await aliceContext.close()
  })
})
