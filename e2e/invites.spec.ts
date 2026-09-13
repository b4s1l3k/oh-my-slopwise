import { expect, test } from "@playwright/test"
import {
  apiJson,
  authenticatedContext,
  createGroup,
  userId,
  users,
} from "./helpers"

test.describe("group invitations", () => {
  test("lets several users accept a reusable invitation and invalidates it after revocation", async ({
    browser,
  }) => {
    const adminContext = await authenticatedContext(browser, users.alice)
    const adminPage = adminContext.pages()[0]
    const groupId = await createGroup(adminPage, { name: "Reusable Invite E2E" })
    await adminPage.goto(`/groups/${groupId}/settings`)
    await adminPage.getByRole("button", { name: "Создать ссылку" }).click()
    const inviteInput = adminPage.locator('input[readonly][value*="/invite/"]')
    await expect(inviteInput).toBeVisible()
    const inviteUrl = await inviteInput.inputValue()

    const carolContext = await authenticatedContext(browser, users.carol)
    const carolPage = carolContext.pages()[0]
    await carolPage.goto(inviteUrl)
    await expect(carolPage.getByText("Reusable Invite E2E")).toBeVisible()
    await carolPage.getByRole("button", { name: "Присоединиться" }).click()
    await expect(carolPage).toHaveURL(new RegExp(`/groups/${groupId}$`))

    const outsiderContext = await authenticatedContext(browser, users.outsider)
    const outsiderPage = outsiderContext.pages()[0]
    await outsiderPage.goto(inviteUrl)
    await expect(outsiderPage.getByText("2 участников")).toBeVisible()
    await outsiderPage.getByRole("button", { name: "Присоединиться" }).click()
    await expect(outsiderPage).toHaveURL(new RegExp(`/groups/${groupId}$`))

    const group = await apiJson<{ group: { members: Array<{ user: { name: string } }> } }>(
      adminPage,
      `/api/v1/groups/${groupId}`
    )
    expect(group.group.members.map((member) => member.user.name)).toEqual(
      expect.arrayContaining([users.alice.name, users.carol.name, users.outsider.name])
    )

    await adminPage.getByRole("button", { name: "Отозвать ссылку" }).click()
    await expect(adminPage.getByText("Ссылка отозвана")).toBeVisible()
    await outsiderPage.goto(inviteUrl)
    await expect(outsiderPage.getByText("Приглашение недействительно")).toBeVisible()

    await outsiderContext.close()
    await carolContext.close()
    await adminContext.close()
  })

  test("returns the same active invitation to every member but only admin can revoke it", async ({
    browser,
  }) => {
    const adminContext = await authenticatedContext(browser, users.alice)
    const adminPage = adminContext.pages()[0]
    const bobId = await userId(adminPage, "Боб")
    const groupId = await createGroup(adminPage, {
      name: "Shared Invite E2E",
      memberIds: [bobId],
    })
    const adminInvite = await apiJson<{ token: string }>(
      adminPage,
      `/api/v1/groups/${groupId}/invite`,
      { method: "POST" }
    )

    const memberContext = await authenticatedContext(browser, users.bob)
    const memberPage = memberContext.pages()[0]
    const memberInvite = await apiJson<{ token: string }>(
      memberPage,
      `/api/v1/groups/${groupId}/invite`,
      { method: "POST" }
    )
    expect(memberInvite.token).toBe(adminInvite.token)

    const forbiddenRevoke = await memberPage.request.delete(`/api/v1/groups/${groupId}/invite`)
    expect(forbiddenRevoke.status()).toBe(403)
    expect(await forbiddenRevoke.json()).toMatchObject({ error: { code: "FORBIDDEN" } })
    expect((await memberPage.request.get(`/api/v1/invites/${adminInvite.token}`)).status()).toBe(200)

    await memberContext.close()
    await adminContext.close()
  })

  test("shows the already-member state and accepts the same invitation idempotently", async ({
    browser,
  }) => {
    const adminContext = await authenticatedContext(browser, users.alice)
    const adminPage = adminContext.pages()[0]
    const bobId = await userId(adminPage, "Боб")
    const groupId = await createGroup(adminPage, {
      name: "Idempotent Invite E2E",
      memberIds: [bobId],
    })
    const { token } = await apiJson<{ token: string }>(
      adminPage,
      `/api/v1/groups/${groupId}/invite`,
      { method: "POST" }
    )

    const memberContext = await authenticatedContext(browser, users.bob)
    const memberPage = memberContext.pages()[0]
    await memberPage.goto(`/invite/${token}`)
    await expect(memberPage.getByText("Вы уже участник этой группы")).toBeVisible()
    await expect(memberPage.getByRole("button", { name: "Перейти в группу" })).toBeVisible()
    await expect(memberPage.getByRole("button", { name: "Присоединиться" })).toHaveCount(0)

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await memberPage.request.post(`/api/v1/invites/${token}/accept`)
      expect(response.status()).toBe(200)
      expect(await response.json()).toEqual({ groupId })
    }
    const group = await apiJson<{ group: { members: Array<{ userId: string }> } }>(
      adminPage,
      `/api/v1/groups/${groupId}`
    )
    expect(group.group.members.filter((member) => member.userId === bobId)).toHaveLength(1)
    expect(group.group.members).toHaveLength(2)

    await memberContext.close()
    await adminContext.close()
  })

  test("rejects unknown and revoked invitation tokens in both UI and API", async ({
    browser,
  }) => {
    const adminContext = await authenticatedContext(browser, users.alice)
    const adminPage = adminContext.pages()[0]
    const groupId = await createGroup(adminPage, { name: "Revoked Invite E2E" })
    const { token } = await apiJson<{ token: string }>(
      adminPage,
      `/api/v1/groups/${groupId}/invite`,
      { method: "POST" }
    )
    await apiJson(adminPage, `/api/v1/groups/${groupId}/invite`, { method: "DELETE" })

    const outsiderContext = await authenticatedContext(browser, users.outsider)
    const outsiderPage = outsiderContext.pages()[0]
    for (const invalidToken of [token, "unknown-invite-token"]) {
      await outsiderPage.goto(`/invite/${invalidToken}`)
      await expect(outsiderPage.getByText("Приглашение недействительно")).toBeVisible()

      const accept = await outsiderPage.request.post(`/api/v1/invites/${invalidToken}/accept`)
      expect(accept.status()).toBe(404)
      expect(await accept.json()).toMatchObject({ error: { code: "INVITE_INVALID" } })
    }

    await outsiderContext.close()
    await adminContext.close()
  })

})
