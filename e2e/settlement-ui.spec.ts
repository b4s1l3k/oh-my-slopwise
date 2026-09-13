import { expect, test } from "@playwright/test"
import {
  apiJson,
  authenticatedContext,
  createExpense,
  createGroup,
  userId,
  users,
} from "./helpers"

test.describe("settlement browser workflow", () => {
  test("debtor sees creditor requisites and clears debt from the dialog", async ({ browser }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const aliceId = (await apiJson<{ user: { id: string } }>(alicePage, "/api/v1/users/me")).user.id
    const bobId = await userId(alicePage, "Боб")
    const groupId = await createGroup(alicePage, { name: "UI Settlement E2E", memberIds: [bobId] })
    await createExpense(alicePage, groupId, {
      title: "Shared E2E",
      amount: 10_000,
      currency: "RUB",
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }, { userId: bobId }],
    })

    const bobContext = await authenticatedContext(browser, users.bob)
    const bobPage = bobContext.pages()[0]
    await bobPage.goto(`/groups/${groupId}`)
    await bobPage.getByRole("button", { name: "Оплатить" }).click()
    const dialog = bobPage.getByRole("dialog")
    await expect(dialog.getByText("Алиса Тестовая")).toBeVisible()
    await expect(dialog.getByText("Альфа Тест")).toBeVisible()
    await expect(dialog.getByText("+79990000002")).toBeVisible()
    await dialog.getByRole("button", { name: "Зафиксировать расчёт" }).click()

    await expect(dialog).toHaveCount(0)
    await expect(bobPage.getByText("Все расчёты завершены!")).toBeVisible()

    await bobContext.close()
    await aliceContext.close()
  })
})
