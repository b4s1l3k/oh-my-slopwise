import { expect, test } from "@playwright/test"
import { apiJson, authenticatedContext, createGroup, login, userId, users } from "./helpers"

test.describe("destructive group confirmation UI", () => {
  test("cancelling group deletion leaves the group and current page intact", async ({ page }) => {
    await login(page, users.alice)
    const groupId = await createGroup(page, { name: "Cancelled Group Deletion E2E" })
    await page.goto(`/groups/${groupId}/settings`)
    page.once("dialog", (dialog) => dialog.dismiss())

    await page.getByRole("button", { name: "Удалить группу" }).click()

    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/settings$`))
    await expect(page.getByRole("heading", { name: "Настройки группы" })).toBeVisible()
    expect((await page.request.get(`/api/v1/groups/${groupId}`)).status()).toBe(200)
  })

  test("cancelling member exit keeps membership and group access", async ({ browser }) => {
    const adminContext = await authenticatedContext(browser, users.alice)
    const adminPage = adminContext.pages()[0]
    const bobId = await userId(adminPage, "Боб")
    const groupId = await createGroup(adminPage, {
      name: "Cancelled Member Exit E2E",
      memberIds: [bobId],
    })
    const memberContext = await authenticatedContext(browser, users.bob)
    const memberPage = memberContext.pages()[0]
    await memberPage.goto(`/groups/${groupId}/settings`)
    memberPage.once("dialog", (dialog) => dialog.dismiss())

    await memberPage.getByRole("button", { name: "Выйти из группы" }).click()

    await expect(memberPage).toHaveURL(new RegExp(`/groups/${groupId}/settings$`))
    expect((await memberPage.request.get(`/api/v1/groups/${groupId}`)).status()).toBe(200)
    const group = await apiJson<{ group: { members: Array<{ userId: string }> } }>(
      adminPage,
      `/api/v1/groups/${groupId}`
    )
    expect(group.group.members.some((member) => member.userId === bobId)).toBe(true)

    await memberContext.close()
    await adminContext.close()
  })
})
