import { expect, test } from "@playwright/test"
import { apiJson, authenticatedContext, createGroup, userId, users } from "./helpers"

test.describe("leaving and rejoining groups", () => {
  test("a debt-free member leaves and can rejoin through an invite as MEMBER", async ({ browser }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const bobId = await userId(alicePage, "Боб")
    const groupId = await createGroup(alicePage, { name: "Leave Rejoin E2E", memberIds: [bobId] })
    const token = (await apiJson<{ token: string }>(alicePage, `/api/v1/groups/${groupId}/invite`, {
      method: "POST",
      expectedStatus: 200,
    })).token

    const bobContext = await authenticatedContext(browser, users.bob)
    const bobPage = bobContext.pages()[0]
    await bobPage.goto(`/groups/${groupId}/settings`)
    bobPage.once("dialog", (dialog) => dialog.accept())
    await bobPage.getByRole("button", { name: "Выйти из группы" }).click()
    await expect(bobPage).toHaveURL(/\/groups$/)

    await bobPage.goto(`/invite/${token}`)
    await bobPage.getByRole("button", { name: "Присоединиться" }).click()
    await expect(bobPage).toHaveURL(new RegExp(`/groups/${groupId}$`))
    const group = await apiJson<{ group: { members: Array<{ userId: string; role: string }> } }>(
      alicePage,
      `/api/v1/groups/${groupId}`
    )
    expect(group.group.members.find((member) => member.userId === bobId)?.role).toBe("MEMBER")

    await bobContext.close()
    await aliceContext.close()
  })

  test("a member with debt cannot leave and admin cannot leave", async ({ browser }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const aliceId = (await apiJson<{ user: { id: string } }>(alicePage, "/api/v1/users/me")).user.id
    const bobId = await userId(alicePage, "Боб")
    const groupId = await createGroup(alicePage, { name: "Blocked Leave E2E", memberIds: [bobId] })
    await apiJson(alicePage, `/api/v1/groups/${groupId}/expenses`, {
      method: "POST",
      expectedStatus: 201,
      body: {
        title: "Debt",
        amount: 2_000,
        currency: "RUB",
        date: "2026-09-13",
        paidById: aliceId,
        splitType: "EQUAL",
        splits: [{ userId: aliceId }, { userId: bobId }],
      },
    })

    const bobContext = await authenticatedContext(browser, users.bob)
    const bobPage = bobContext.pages()[0]
    const memberLeave = await bobPage.request.delete(
      `/api/v1/groups/${groupId}/members?userId=${bobId}`
    )
    expect(memberLeave.status()).toBe(409)
    expect(await memberLeave.json()).toMatchObject({ error: { code: "MEMBER_HAS_BALANCE" } })

    const adminLeave = await alicePage.request.delete(
      `/api/v1/groups/${groupId}/members?userId=${aliceId}`
    )
    expect(adminLeave.status()).toBe(409)
    expect(await adminLeave.json()).toMatchObject({ error: { code: "ADMIN_CANNOT_LEAVE" } })

    await bobContext.close()
    await aliceContext.close()
  })
})
