import { expect, test } from "@playwright/test"
import {
  apiJson,
  authenticatedContext,
  createExpense,
  createGroup,
  login,
  userId,
  users,
} from "./helpers"

test.describe("dialog accessibility and cancellation", () => {
  test("opens the expense dialog from the keyboard and discards it with Escape", async ({ page }) => {
    await login(page, users.alice)
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, {
      name: "Expense Dialog Recovery E2E",
      memberIds: [bobId],
    })
    await page.goto(`/groups/${groupId}`)

    let createRequests = 0
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().includes(`/api/v1/groups/${groupId}/expenses`)
      ) {
        createRequests += 1
      }
    })

    const openExpense = page.getByRole("button", { name: "Расход", exact: true })
    await openExpense.focus()
    await page.keyboard.press("Enter")
    const dialog = page.getByRole("dialog", { name: "Новый расход" })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Закрыть" })).toBeVisible()
    await expect(dialog.getByLabel("Название *")).toBeVisible()
    await expect(dialog.getByLabel("Сумма траты *")).toBeVisible()
    await expect(dialog.getByLabel("Дата", { exact: true })).toBeVisible()
    await expect(dialog.getByLabel("Кто заплатил")).toBeVisible()

    await dialog.getByLabel("Название *").fill("Несохранённый расход")
    await dialog.getByLabel("Сумма траты *").fill("42.50")
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    expect(createRequests).toBe(0)

    await openExpense.click()
    const reopened = page.getByRole("dialog", { name: "Новый расход" })
    await expect(reopened.getByLabel("Название *")).toHaveValue("")
    await expect(reopened.getByLabel("Сумма траты *")).toHaveValue("")
    await reopened.getByRole("button", { name: "Закрыть" }).click()
    await expect(reopened).toHaveCount(0)
  })

  test("keeps keyboard focus inside an open expense dialog", async ({ page }) => {
    await login(page, users.alice)
    const groupId = await createGroup(page, { name: "Expense Focus Trap E2E" })
    await page.goto(`/groups/${groupId}`)
    await page.getByRole("button", { name: "Расход", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Новый расход" })

    for (let index = 0; index < 18; index += 1) {
      await page.keyboard.press("Tab")
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
    }
  })

  test("offers labelled requisites fields and continues after skipping", async ({ page }) => {
    await login(page, users.carol)
    const groupId = await createGroup(page, { name: "Requisites Nudge Skip E2E" })
    await page.goto(`/groups/${groupId}`)
    await page.getByRole("button", { name: "Расход", exact: true }).click()

    const nudge = page.getByRole("dialog", { name: "Добавьте реквизиты" })
    await expect(nudge.getByLabel("ФИО получателя")).toBeVisible()
    await expect(nudge.getByLabel("Банк", { exact: true })).toBeVisible()
    await expect(nudge.getByLabel("Номер карты / телефона")).toBeVisible()
    await expect(nudge.getByRole("button", { name: "Сохранить в профиль" })).toBeDisabled()
    await expect(nudge.getByRole("button", { name: "Только для этой группы" })).toBeDisabled()

    await nudge.getByRole("button", { name: "Пропустить" }).click()
    await expect(page.getByRole("dialog", { name: "Новый расход" })).toBeVisible()
  })

  test("saves requisites for one group and then opens the expense form", async ({ page }) => {
    await login(page, users.outsider)
    const groupId = await createGroup(page, { name: "Requisites Nudge Save E2E" })
    await page.goto(`/groups/${groupId}`)
    await page.getByRole("button", { name: "Расход", exact: true }).click()

    const nudge = page.getByRole("dialog", { name: "Добавьте реквизиты" })
    await nudge.getByLabel("ФИО получателя").fill("Получатель для группы")
    await nudge.getByLabel("Банк", { exact: true }).fill("Банк для группы")
    await nudge.getByLabel("Номер карты / телефона").fill("GROUP-ONLY-ACCOUNT")
    await nudge.getByRole("button", { name: "Только для этой группы" }).click()

    await expect(page.getByText("Реквизиты сохранены для этой группы", { exact: true })).toBeVisible()
    await expect(page.getByRole("dialog", { name: "Новый расход" })).toBeVisible()
    const outsiderId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const group = await apiJson<{
      group: {
        members: Array<{
          userId: string
          payeeName: string | null
          bankName: string | null
          payeeAccount: string | null
        }>
      }
    }>(page, `/api/v1/groups/${groupId}`)
    expect(group.group.members.find((member) => member.userId === outsiderId)).toMatchObject({
      payeeName: "Получатель для группы",
      bankName: "Банк для группы",
      payeeAccount: "GROUP-ONLY-ACCOUNT",
    })
  })

  test("labels settlement fields and closes without creating a payment", async ({ browser }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const aliceId = (await apiJson<{ user: { id: string } }>(
      alicePage,
      "/api/v1/users/me"
    )).user.id
    const bobId = await userId(alicePage, "Боб")
    const groupId = await createGroup(alicePage, {
      name: "Settlement Dialog Cancel E2E",
      memberIds: [bobId],
    })
    await createExpense(alicePage, groupId, {
      title: "Settlement dialog debt",
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
    let settlementRequests = 0
    bobPage.on("request", (request) => {
      if (request.method() === "POST" && request.url().endsWith("/api/v1/settlements")) {
        settlementRequests += 1
      }
    })

    await bobPage.getByRole("button", { name: "Оплатить" }).click()
    const dialog = bobPage.getByRole("dialog", { name: /Рассчитаться с/ })
    await expect(dialog.getByLabel("Сумма", { exact: true })).toHaveValue("50.00")
    await expect(dialog.getByLabel("Дата", { exact: true })).toBeVisible()
    await dialog.getByLabel("Заметка (необязательно)").fill("Не отправлять")
    await bobPage.keyboard.press("Escape")

    await expect(dialog).toHaveCount(0)
    await expect(bobPage.getByRole("button", { name: "Оплатить" })).toBeVisible()
    expect(settlementRequests).toBe(0)

    await bobContext.close()
    await aliceContext.close()
  })
})
