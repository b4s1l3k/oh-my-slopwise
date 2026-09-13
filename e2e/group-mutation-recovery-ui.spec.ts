import { expect, test, type Route } from "@playwright/test"
import { apiJson, createGroup, login, userId, users } from "./helpers"

async function failJson(route: Route, message: string): Promise<void> {
  await route.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }),
  })
}

test.describe("group mutation recovery UI", () => {
  test("preserves a failed new-group form and succeeds when submitted again", async ({ page }) => {
    await login(page, users.alice)
    let createAttempts = 0
    await page.route("**/api/v1/groups", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue()
        return
      }
      createAttempts += 1
      if (createAttempts === 1) {
        await failJson(route, "Temporary group failure")
        return
      }
      await route.continue()
    })

    await page.goto("/groups/new")
    await page.getByLabel("Название *").fill("Retry Group UI E2E")
    await page.getByRole("combobox").click()
    await page.getByRole("option", { name: /Поездка/ }).click()
    await page.getByRole("button", { name: "₽ RUB" }).click()
    await page.getByRole("button", { name: /USD.*Доллар США/ }).click()
    await page.getByPlaceholder("Найти по имени...").fill("Боб")
    await page.getByRole("button", { name: users.bob.name }).click()

    await page.getByRole("button", { name: "Создать группу" }).click()
    await expect(page.getByText("Ошибка создания группы", { exact: true })).toBeVisible()
    await expect(page.getByLabel("Название *")).toHaveValue("Retry Group UI E2E")
    await expect(page.getByText(users.bob.name, { exact: true })).toBeVisible()
    await expect(page).toHaveURL(/\/groups\/new$/)

    await page.getByRole("button", { name: "Создать группу" }).click()
    await page.waitForURL(
      (url) => /^\/groups\/[^/]+$/.test(url.pathname) && url.pathname !== "/groups/new"
    )
    const groupId = new URL(page.url()).pathname.split("/").at(-1)!
    const response = await apiJson<{
      group: { name: string; type: string; currency: string; members: Array<{ user: { name: string } }> }
    }>(page, `/api/v1/groups/${groupId}`)
    expect(response.group).toMatchObject({
      name: "Retry Group UI E2E",
      type: "TRIP",
      currency: "USD",
    })
    expect(response.group.members.map((member) => member.user.name)).toContain(users.bob.name)
    expect(createAttempts).toBe(2)
  })

  test("keeps an unsaved rename after failure and persists it on retry", async ({ page }) => {
    await login(page, users.alice)
    const groupId = await createGroup(page, { name: "Rename Recovery Original E2E" })
    let patchAttempts = 0
    await page.route(`**/api/v1/groups/${groupId}`, async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.continue()
        return
      }
      patchAttempts += 1
      if (patchAttempts === 1) {
        await failJson(route, "Rename temporarily unavailable")
        return
      }
      await route.continue()
    })

    await page.goto(`/groups/${groupId}/settings`)
    const name = page.getByRole("textbox", { name: "Название группы" })
    await name.fill("Rename Recovery Final E2E")
    await page.getByRole("button", { name: "Сохранить", exact: true }).first().click()
    await expect(page.getByText("Rename temporarily unavailable", { exact: true })).toBeVisible()
    await expect(name).toHaveValue("Rename Recovery Final E2E")

    await page.getByRole("button", { name: "Сохранить", exact: true }).first().click()
    await expect(page.getByText("Название обновлено", { exact: true })).toBeVisible()
    await expect.poll(async () =>
      (await apiJson<{ group: { name: string } }>(page, `/api/v1/groups/${groupId}`)).group.name
    ).toBe("Rename Recovery Final E2E")
    expect(patchAttempts).toBe(2)
  })

  test("preserves requisites and membership after failed mutations, then retries both", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, { name: "Settings Mutation Recovery E2E" })
    let requisitesAttempts = 0
    let memberAttempts = 0
    await page.route(`**/api/v1/groups/${groupId}/requisites`, async (route) => {
      requisitesAttempts += 1
      if (requisitesAttempts === 1) {
        await failJson(route, "Requisites temporarily unavailable")
        return
      }
      await route.continue()
    })
    await page.route(`**/api/v1/groups/${groupId}/members`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue()
        return
      }
      memberAttempts += 1
      if (memberAttempts === 1) {
        await failJson(route, "Membership temporarily unavailable")
        return
      }
      await route.continue()
    })

    await page.goto(`/groups/${groupId}/settings`)
    await page.getByText("ФИО получателя", { exact: true }).locator("..").getByRole("textbox")
      .fill("Retry Recipient")
    await page.getByText("Банк", { exact: true }).locator("..").getByRole("textbox")
      .fill("Retry Bank")
    await page.getByText("Номер карты / телефона", { exact: true }).locator("..").getByRole("textbox")
      .fill("RETRY-ACCOUNT")
    await page.getByRole("button", { name: "Сохранить реквизиты" }).click()
    await expect(page.getByText("Requisites temporarily unavailable", { exact: true })).toBeVisible()
    await expect(page.getByText("ФИО получателя", { exact: true }).locator("..").getByRole("textbox"))
      .toHaveValue("Retry Recipient")
    await page.getByRole("button", { name: "Сохранить реквизиты" }).click()
    await expect(page.getByText("Реквизиты для поездки сохранены", { exact: true })).toBeVisible()

    const search = page.getByPlaceholder("Добавить по имени...")
    await search.fill("Боб")
    await page.getByRole("button", { name: users.bob.name }).click()
    await expect(page.getByText("Membership temporarily unavailable", { exact: true })).toBeVisible()
    await expect(search).toHaveValue("Боб")
    await page.getByRole("button", { name: users.bob.name }).click()
    await expect(page.getByText("Участник добавлен", { exact: true })).toBeVisible()

    const group = await apiJson<{
      group: { members: Array<{ userId: string; payeeName: string | null; bankName: string | null }> }
    }>(page, `/api/v1/groups/${groupId}`)
    expect(group.group.members.some((member) => member.userId === bobId)).toBe(true)
    expect(group.group.members.find((member) => member.userId === aliceId)).toMatchObject({
      payeeName: "Retry Recipient",
      bankName: "Retry Bank",
    })
    expect({ requisitesAttempts, memberAttempts }).toEqual({
      requisitesAttempts: 2,
      memberAttempts: 2,
    })
  })
})
