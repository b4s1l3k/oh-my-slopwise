import { expect, test } from "@playwright/test"
import { apiJson, authenticatedContext, createGroup, login, userId, users } from "./helpers"

type Requisites = {
  payeeName: string | null
  bankName: string | null
  payeeAccount: string | null
}

test.describe("group requisites API", () => {
  test("lets every active member normalize, persist and clear personal overrides", async ({
    browser,
  }) => {
    const adminContext = await authenticatedContext(browser, users.alice)
    const adminPage = adminContext.pages()[0]
    const bobId = await userId(adminPage, "Боб")
    const groupId = await createGroup(adminPage, {
      name: "Member Requisites E2E",
      memberIds: [bobId],
    })

    const memberContext = await authenticatedContext(browser, users.bob)
    const memberPage = memberContext.pages()[0]
    const saved = await apiJson<{ requisites: Requisites }>(
      memberPage,
      `/api/v1/groups/${groupId}/requisites`,
      {
        method: "PATCH",
        body: {
          payeeName: "  Локальный Получатель  ",
          bankName: "  Локальный Банк  ",
          payeeAccount: "  LOCAL-ACCOUNT  ",
        },
      }
    )
    expect(saved.requisites).toEqual({
      payeeName: "Локальный Получатель",
      bankName: "Локальный Банк",
      payeeAccount: "LOCAL-ACCOUNT",
    })

    const ownView = await apiJson<{
      group: { members: Array<{ userId: string } & Requisites> }
    }>(memberPage, `/api/v1/groups/${groupId}`)
    expect(ownView.group.members.find((member) => member.userId === bobId)).toMatchObject(
      saved.requisites
    )

    const cleared = await apiJson<{ requisites: Requisites }>(
      memberPage,
      `/api/v1/groups/${groupId}/requisites`,
      {
        method: "PATCH",
        body: { payeeName: " ", bankName: "", payeeAccount: null },
      }
    )
    expect(cleared.requisites).toEqual({ payeeName: null, bankName: null, payeeAccount: null })

    await memberContext.close()
    await adminContext.close()
  })

  test("accepts exact field limits and preserves them after rejected updates", async ({ page }) => {
    await login(page, users.alice)
    const groupId = await createGroup(page, { name: "Requisites Boundaries E2E" })
    const maximum = {
      payeeName: "N".repeat(200),
      bankName: "B".repeat(100),
      payeeAccount: "A".repeat(100),
    }

    const accepted = await apiJson<{ requisites: Requisites }>(
      page,
      `/api/v1/groups/${groupId}/requisites`,
      { method: "PATCH", body: maximum }
    )
    expect(accepted.requisites).toEqual(maximum)

    for (const body of [
      { payeeName: "N".repeat(201) },
      { bankName: "B".repeat(101) },
      { payeeAccount: "A".repeat(101) },
      { payeeName: 42 },
      null,
    ]) {
      const response = await page.request.patch(`/api/v1/groups/${groupId}/requisites`, {
        data: body,
      })
      expect(response.status(), await response.text()).toBe(422)
    }

    const unchanged = await apiJson<{
      group: { members: Array<Requisites & { userId: string }> }
    }>(page, `/api/v1/groups/${groupId}`)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    expect(unchanged.group.members.find((member) => member.userId === aliceId)).toMatchObject(maximum)
  })

  test("rejects outsiders and inactive former members", async ({ browser }) => {
    const adminContext = await authenticatedContext(browser, users.alice)
    const adminPage = adminContext.pages()[0]
    const bobId = await userId(adminPage, "Боб")
    const groupId = await createGroup(adminPage, {
      name: "Requisites Membership E2E",
      memberIds: [bobId],
    })

    const outsiderContext = await authenticatedContext(browser, users.outsider)
    const outsiderPage = outsiderContext.pages()[0]
    const outsider = await outsiderPage.request.patch(`/api/v1/groups/${groupId}/requisites`, {
      data: { bankName: "Forbidden outsider" },
    })
    expect(outsider.status()).toBe(403)

    await apiJson(adminPage, `/api/v1/groups/${groupId}/members?userId=${bobId}`, {
      method: "DELETE",
    })
    const formerContext = await authenticatedContext(browser, users.bob)
    const formerPage = formerContext.pages()[0]
    const inactive = await formerPage.request.patch(`/api/v1/groups/${groupId}/requisites`, {
      data: { bankName: "Forbidden inactive" },
    })
    expect(inactive.status()).toBe(403)

    await formerContext.close()
    await outsiderContext.close()
    await adminContext.close()
  })
})
