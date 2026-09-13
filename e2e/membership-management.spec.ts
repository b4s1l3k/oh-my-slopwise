import { expect, test } from "@playwright/test"
import {
  apiJson,
  authenticatedContext,
  createGroup,
  login,
  userId,
  users,
} from "./helpers"

test.describe("membership management", () => {
  test("adds and removes a member while filtering active members from search", async ({
    browser,
  }) => {
    const adminContext = await authenticatedContext(browser, users.alice)
    const adminPage = adminContext.pages()[0]
    const bobId = await userId(adminPage, "Боб")
    const groupId = await createGroup(adminPage, { name: "Members E2E" })

    await adminPage.goto(`/groups/${groupId}/settings`)
    const search = adminPage.getByPlaceholder("Добавить по имени...")
    await search.fill("Боб")
    await adminPage.getByRole("button", { name: users.bob.name }).click()
    await expect(adminPage.getByText("Участник добавлен")).toBeVisible()
    await expect(adminPage.getByText("Участники (2)")).toBeVisible()

    await search.fill("Боб")
    await expect(adminPage.getByRole("button", { name: users.bob.name })).toHaveCount(0)
    await search.fill("Кар")
    await expect(adminPage.getByRole("button", { name: users.carol.name })).toBeVisible()
    await search.fill("")

    const memberContext = await authenticatedContext(browser, users.bob)
    const memberPage = memberContext.pages()[0]
    await memberPage.goto(`/groups/${groupId}/settings`)
    await expect(memberPage.getByPlaceholder("Добавить по имени...")).toHaveCount(0)
    await expect(memberPage.getByRole("button", { name: "Удалить группу" })).toHaveCount(0)
    await expect(memberPage.getByRole("button", { name: "Выйти из группы" })).toBeVisible()

    await adminPage.getByTitle("Удалить участника").click()
    await expect(adminPage.getByText("Участник удалён")).toBeVisible()
    await expect(adminPage.getByText("Участники (1)")).toBeVisible()

    expect((await memberPage.request.get(`/api/v1/groups/${groupId}`)).status()).toBe(404)
    const group = await apiJson<{ group: { members: Array<{ userId: string }> } }>(
      adminPage,
      `/api/v1/groups/${groupId}`
    )
    expect(group.group.members).toHaveLength(1)
    expect(group.group.members.some((member) => member.userId === bobId)).toBe(false)

    await memberContext.close()
    await adminContext.close()
  })

  test("re-adds an inactive member through the UI with the MEMBER role", async ({ page }) => {
    await login(page, users.alice)

    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, {
      name: "Reactivate Member E2E",
      memberIds: [bobId],
    })
    await apiJson(page, `/api/v1/groups/${groupId}/members?userId=${bobId}`, {
      method: "DELETE",
    })

    await page.goto(`/groups/${groupId}/settings`)
    await page.getByPlaceholder("Добавить по имени...").fill("Боб")
    await page.getByRole("button", { name: users.bob.name }).click()
    await expect(page.getByText("Участник добавлен")).toBeVisible()

    const group = await apiJson<{
      group: { members: Array<{ userId: string; role: string; isActive: boolean }> }
    }>(page, `/api/v1/groups/${groupId}`)
    expect(group.group.members).toContainEqual(
      expect.objectContaining({ userId: bobId, role: "MEMBER", isActive: true })
    )
  })

  test("prevents a regular member from administering members and group settings", async ({
    browser,
  }) => {
    const adminContext = await authenticatedContext(browser, users.alice)
    const adminPage = adminContext.pages()[0]
    const aliceId = (await apiJson<{ user: { id: string } }>(adminPage, "/api/v1/users/me")).user.id
    const bobId = await userId(adminPage, "Боб")
    const carolId = await userId(adminPage, "Карина")
    const groupId = await createGroup(adminPage, {
      name: "Member Permissions E2E",
      memberIds: [bobId],
    })

    const memberContext = await authenticatedContext(browser, users.bob)
    const memberPage = memberContext.pages()[0]

    const add = await memberPage.request.post(`/api/v1/groups/${groupId}/members`, {
      data: { userId: carolId },
    })
    expect(add.status()).toBe(403)
    expect(await add.json()).toMatchObject({ error: { code: "FORBIDDEN" } })

    const remove = await memberPage.request.delete(
      `/api/v1/groups/${groupId}/members?userId=${aliceId}`
    )
    expect(remove.status()).toBe(403)
    expect(await remove.json()).toMatchObject({ error: { code: "FORBIDDEN" } })

    const rename = await memberPage.request.patch(`/api/v1/groups/${groupId}`, {
      data: { name: "Unauthorized rename" },
    })
    expect(rename.status()).toBe(403)
    expect(await rename.json()).toMatchObject({ error: { code: "FORBIDDEN" } })

    const unchanged = await apiJson<{ group: { name: string; members: Array<{ userId: string }> } }>(
      adminPage,
      `/api/v1/groups/${groupId}`
    )
    expect(unchanged.group.name).toBe("Member Permissions E2E")
    expect(unchanged.group.members.some((member) => member.userId === carolId)).toBe(false)

    await memberContext.close()
    await adminContext.close()
  })

  test("blocks outsiders at both UI and API boundaries", async ({ browser }) => {
    const adminContext = await authenticatedContext(browser, users.alice)
    const adminPage = adminContext.pages()[0]
    const groupId = await createGroup(adminPage, { name: "Private E2E" })

    const outsiderContext = await authenticatedContext(browser, users.outsider)
    const outsiderPage = outsiderContext.pages()[0]
    await outsiderPage.goto(`/groups/${groupId}`)
    await expect(outsiderPage.getByText("Группа не найдена")).toBeVisible()
    await outsiderPage.goto(`/groups/${groupId}/settings`)
    await expect(outsiderPage.getByText("Группа не найдена")).toBeVisible()
    expect((await outsiderPage.request.get(`/api/v1/groups/${groupId}/balances`)).status()).toBe(403)
    expect((await outsiderPage.request.get(`/api/v1/groups/${groupId}/expenses`)).status()).toBe(403)
    expect((await outsiderPage.request.get(`/api/v1/groups/${groupId}/activity`)).status()).toBe(403)
    expect((await outsiderPage.request.post(`/api/v1/groups/${groupId}/invite`)).status()).toBe(403)

    await outsiderContext.close()
    await adminContext.close()
  })
})
