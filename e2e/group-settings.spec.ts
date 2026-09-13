import { expect, test } from "@playwright/test"
import { apiJson, login, users } from "./helpers"

test.describe("group settings", () => {
  test("creates a group in the UI, renames it and persists group requisites", async ({ page }) => {
    await login(page, users.alice)
    await page.goto("/groups/new")
    await page.getByLabel("Название *").fill("UI Поездка E2E")
    await page.getByRole("button", { name: "Создать группу" }).click()
    await page.waitForURL(
      (url) => /^\/groups\/[^/]+$/.test(url.pathname) && url.pathname !== "/groups/new"
    )
    await expect(page.getByRole("heading", { name: "UI Поездка E2E" })).toBeVisible()

    await page.getByTitle("Настройки группы").click()
    await expect(page.getByRole("heading", { name: "Настройки группы" })).toBeVisible()
    const nameInput = page.locator('input[value="UI Поездка E2E"]')
    await nameInput.fill("UI Поездка обновлена")
    await page.getByRole("button", { name: "Сохранить", exact: true }).first().click()
    await expect(page.getByText("Название обновлено")).toBeVisible()

    const requisitesInput = (label: string) =>
      page.getByText(label, { exact: true }).locator("..").getByRole("textbox")
    await requisitesInput("ФИО получателя").fill("Групповой Получатель")
    await requisitesInput("Банк").fill("Групповой Банк")
    await requisitesInput("Номер карты / телефона").fill("GROUP-ACCOUNT")
    await page.getByRole("button", { name: "Сохранить реквизиты" }).click()
    await expect(page.getByText("Реквизиты для поездки сохранены")).toBeVisible()

    await page.reload()
    await expect(page.locator('input[value="UI Поездка обновлена"]')).toBeVisible()
    await expect(requisitesInput("ФИО получателя")).toHaveValue("Групповой Получатель")
    await expect(requisitesInput("Банк")).toHaveValue("Групповой Банк")
    await expect(requisitesInput("Номер карты / телефона")).toHaveValue("GROUP-ACCOUNT")
  })

  test("requires a name and filters selected users while creating a group", async ({ page }) => {
    await login(page, users.alice)
    await page.goto("/groups/new")

    const createButton = page.getByRole("button", { name: "Создать группу" })
    await expect(createButton).toBeDisabled()
    await page.getByLabel("Название *").fill("   ")
    await expect(createButton).toBeDisabled()
    await page.getByLabel("Название *").fill("Filtered Members E2E")

    const search = page.getByPlaceholder("Найти по имени...")
    await search.fill("бО")
    await expect(page.getByRole("button", { name: users.bob.name })).toBeVisible()
    await page.getByRole("button", { name: users.bob.name }).click()
    await expect(page.getByText("Добавлены:")).toBeVisible()

    await search.fill("Боб")
    await expect(page.getByRole("button", { name: users.bob.name })).toHaveCount(0)
    await search.fill("Кар")
    await expect(page.getByRole("button", { name: users.carol.name })).toBeVisible()

    await createButton.click()
    await page.waitForURL(
      (url) => /^\/groups\/[^/]+$/.test(url.pathname) && url.pathname !== "/groups/new"
    )
    const groupId = new URL(page.url()).pathname.split("/").at(-1)!
    const response = await apiJson<{
      group: { members: Array<{ user: { name: string } }> }
    }>(page, `/api/v1/groups/${groupId}`)
    expect(response.group.members.map((member) => member.user.name).sort()).toEqual(
      [users.alice.name, users.bob.name].sort()
    )
  })
})
