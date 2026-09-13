import { expect, test, type Route } from "@playwright/test"
import { apiJson, authenticatedContext, createGroup, login, users } from "./helpers"

async function failJson(route: Route, message: string): Promise<void> {
  await route.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }),
  })
}

test.describe("invite mutation recovery UI", () => {
  test("keeps a valid invitation actionable after a failed accept and succeeds on retry", async ({
    browser,
  }) => {
    const adminContext = await authenticatedContext(browser, users.alice)
    const adminPage = adminContext.pages()[0]
    const groupId = await createGroup(adminPage, { name: "Invite Accept Recovery E2E" })
    const { token } = await apiJson<{ token: string }>(
      adminPage,
      `/api/v1/groups/${groupId}/invite`,
      { method: "POST" }
    )

    const outsiderContext = await authenticatedContext(browser, users.outsider)
    const outsiderPage = outsiderContext.pages()[0]
    let attempts = 0
    await outsiderPage.route(`**/api/v1/invites/${token}/accept`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue()
        return
      }
      attempts += 1
      if (attempts === 1) {
        await failJson(route, "Accept temporarily unavailable")
        return
      }
      await route.continue()
    })

    await outsiderPage.goto(`/invite/${token}`)
    await expect(outsiderPage.getByText("Invite Accept Recovery E2E", { exact: true })).toBeVisible()
    const accept = outsiderPage.getByRole("button", { name: "Присоединиться" })
    await accept.click()
    await expect(outsiderPage.getByText("Не удалось вступить", { exact: true })).toBeVisible()
    await expect(accept).toBeEnabled()
    await expect(outsiderPage).toHaveURL(new RegExp(`/invite/${token}$`))
    expect((await outsiderPage.request.get(`/api/v1/invites/${token}`)).status()).toBe(200)

    await accept.click()
    await expect(outsiderPage).toHaveURL(new RegExp(`/groups/${groupId}$`))
    const group = await apiJson<{ group: { members: Array<{ user: { name: string } }> } }>(
      adminPage,
      `/api/v1/groups/${groupId}`
    )
    expect(group.group.members.filter((member) => member.user.name === users.outsider.name)).toHaveLength(1)
    expect(attempts).toBe(2)

    await outsiderContext.close()
    await adminContext.close()
  })

  test("retries invite creation without navigating away or duplicating the active link", async ({ page }) => {
    await login(page, users.alice)
    const groupId = await createGroup(page, { name: "Invite Create Recovery E2E" })
    let attempts = 0
    await page.route(`**/api/v1/groups/${groupId}/invite`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue()
        return
      }
      attempts += 1
      if (attempts === 1) {
        await failJson(route, "Invite temporarily unavailable")
        return
      }
      await route.continue()
    })

    await page.goto(`/groups/${groupId}/settings`)
    await page.getByRole("button", { name: "Создать ссылку" }).click()
    await expect(page.getByText("Invite temporarily unavailable", { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Создать ссылку" })).toBeEnabled()
    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/settings$`))

    await page.getByRole("button", { name: "Создать ссылку" }).click()
    const link = page.locator('input[readonly][value*="/invite/"]')
    await expect(link).toBeVisible()
    const token = (await link.inputValue()).split("/").at(-1)!
    expect((await apiJson<{ token: string }>(page, `/api/v1/groups/${groupId}/invite`, {
      method: "POST",
    })).token).toBe(token)
    expect(attempts).toBe(2)
  })

  test("keeps a working invite visible after failed revocation and revokes it on retry", async ({ page }) => {
    await login(page, users.alice)
    const groupId = await createGroup(page, { name: "Invite Revoke Recovery E2E" })
    const { token } = await apiJson<{ token: string }>(page, `/api/v1/groups/${groupId}/invite`, {
      method: "POST",
    })
    let attempts = 0
    await page.route(`**/api/v1/groups/${groupId}/invite`, async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.continue()
        return
      }
      attempts += 1
      if (attempts === 1) {
        await failJson(route, "Revoke temporarily unavailable")
        return
      }
      await route.continue()
    })

    await page.goto(`/groups/${groupId}/settings`)
    await page.getByRole("button", { name: "Создать ссылку" }).click()
    await page.getByRole("button", { name: "Отозвать ссылку" }).click()
    await expect(page.getByText("Revoke temporarily unavailable", { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Отозвать ссылку" })).toBeVisible()
    expect((await page.request.get(`/api/v1/invites/${token}`)).status()).toBe(200)

    await page.getByRole("button", { name: "Отозвать ссылку" }).click()
    await expect(page.getByText("Ссылка отозвана", { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Создать ссылку" })).toBeVisible()
    expect((await page.request.get(`/api/v1/invites/${token}`)).status()).toBe(404)
    expect(attempts).toBe(2)
  })
})
