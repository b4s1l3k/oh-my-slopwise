import { expect, test } from "@playwright/test"
import {
  apiJson,
  createExpense,
  createGroup,
  login,
  password,
  userId,
  users,
} from "./helpers"

test.describe("navigation history and accessibility", () => {
  test("returns to an exact protected deep link after authentication", async ({ page }) => {
    await login(page, users.alice)
    const groupId = await createGroup(page, { name: "Protected Deep Link E2E" })
    await page.context().clearCookies()

    await page.goto(`/groups/${groupId}`)
    await expect(page).toHaveURL(
      new RegExp(`/login\\?callbackUrl=%2Fgroups%2F${groupId}$`)
    )
    await page.getByLabel("Email").fill(users.alice.email)
    await page.getByLabel("Пароль").fill(password)
    await page.getByRole("button", { name: "Войти" }).click()

    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`))
    await expect(page.getByRole("heading", { name: "Protected Deep Link E2E" })).toBeVisible()
  })

  test("survives detail reload and returns to the group list with browser Back", async ({ page }) => {
    await login(page, users.alice)
    const groupId = await createGroup(page, { name: "History Reload E2E" })
    await page.goto("/groups")
    await page.getByRole("link", { name: /History Reload E2E/ }).click()
    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`))

    await page.reload()
    await expect(page.getByRole("heading", { name: "History Reload E2E" })).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/\/groups$/)
    await expect(page.getByRole("link", { name: /History Reload E2E/ })).toBeVisible()
  })

  test("uses labelled back controls between group, settings and list", async ({ page }) => {
    await login(page, users.alice)
    const groupId = await createGroup(page, { name: "Labelled Back Controls E2E" })
    await page.goto(`/groups/${groupId}`)

    await page.getByRole("button", { name: "Настройки группы" }).click()
    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/settings$`))
    await page.getByRole("button", { name: "К группе" }).click()
    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`))
    await page.getByRole("button", { name: "К списку групп" }).click()
    await expect(page).toHaveURL(/\/groups$/)
  })

  test("marks exactly the current desktop destination", async ({ page }) => {
    await login(page, users.alice)
    const groupId = await createGroup(page, { name: "Current Navigation E2E" })
    await page.goto(`/groups/${groupId}/settings`)

    const navigation = page.getByRole("navigation", { name: "Основная навигация" })
    await expect(navigation.getByRole("link", { name: "Группы" })).toHaveAttribute(
      "aria-current",
      "page"
    )
    await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1)
  })

  test("filters group expenses with a keyboard-operable pressed button", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, {
      name: "Keyboard Expense Filter E2E",
      memberIds: [bobId],
    })
    await createExpense(page, groupId, {
      title: "Только Алиса",
      amount: 1_000,
      currency: "RUB",
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }],
    })
    await createExpense(page, groupId, {
      title: "Только Боб",
      amount: 2_000,
      currency: "RUB",
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: bobId }],
    })
    await page.goto(`/groups/${groupId}`)

    const bobFilter = page.getByRole("button", { name: `Фильтр расходов: ${users.bob.name}` })
    await bobFilter.focus()
    await page.keyboard.press("Space")
    await expect(bobFilter).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByText("Только Боб", { exact: true })).toBeVisible()
    await expect(page.getByText("Только Алиса", { exact: true })).toHaveCount(0)

    await page.keyboard.press("Space")
    await expect(bobFilter).toHaveAttribute("aria-pressed", "false")
    await expect(page.getByText("Только Алиса", { exact: true })).toBeVisible()
  })
})
