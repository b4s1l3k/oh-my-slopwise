import { expect, test } from "@playwright/test"
import {
  apiJson,
  authenticatedContext,
  createGroup,
  userId,
  users,
} from "./helpers"

test.describe("concurrent group invitations", () => {
  test("returns one active invite to concurrent creators and accepts it once", async ({ browser }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const bobId = await userId(alicePage, "Боб")
    const carolId = await userId(alicePage, "Карина")
    const groupId = await createGroup(alicePage, {
      name: "Concurrent invite E2E",
      memberIds: [bobId],
    })
    const bobContext = await authenticatedContext(browser, users.bob)
    const bobPage = bobContext.pages()[0]

    const inviteResponses = await Promise.all([
      alicePage.request.post(`/api/v1/groups/${groupId}/invite`),
      bobPage.request.post(`/api/v1/groups/${groupId}/invite`),
    ])
    expect(inviteResponses.map((response) => response.status())).toEqual([200, 200])
    const inviteBodies = await Promise.all(
      inviteResponses.map((response) => response.json() as Promise<{ token: string }>)
    )
    expect(new Set(inviteBodies.map(({ token }) => token)).size).toBe(1)

    const carolContext = await authenticatedContext(browser, users.carol)
    const carolPage = carolContext.pages()[0]
    const token = inviteBodies[0].token
    const acceptResponses = await Promise.all([
      carolPage.request.post(`/api/v1/invites/${token}/accept`),
      carolPage.request.post(`/api/v1/invites/${token}/accept`),
    ])
    expect(acceptResponses.map((response) => response.status())).toEqual([200, 200])
    await expect(Promise.all(acceptResponses.map((response) => response.json()))).resolves.toEqual([
      { groupId },
      { groupId },
    ])

    const group = await apiJson<{ group: { members: Array<{ userId: string }> } }>(
      alicePage,
      `/api/v1/groups/${groupId}`
    )
    expect(group.group.members.filter(({ userId }) => userId === carolId)).toHaveLength(1)
    const activity = await apiJson<{
      activities: Array<{ type: string; entityId: string }>
    }>(alicePage, `/api/v1/groups/${groupId}/activity`)
    expect(
      activity.activities.filter(
        ({ type, entityId }) => type === "MEMBER_ADDED" && entityId === carolId
      )
    ).toHaveLength(1)

    await carolContext.close()
    await bobContext.close()
    await aliceContext.close()
  })

  test("linearizes acceptance racing with revocation and always leaves the token revoked", async ({
    browser,
  }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const outsiderId = await userId(alicePage, "Внешний")
    const groupId = await createGroup(alicePage, { name: "Invite revoke race E2E" })
    const { token } = await apiJson<{ token: string }>(
      alicePage,
      `/api/v1/groups/${groupId}/invite`,
      { method: "POST" }
    )
    const outsiderContext = await authenticatedContext(browser, users.outsider)
    const outsiderPage = outsiderContext.pages()[0]

    const [revokeResponse, acceptResponse] = await Promise.all([
      alicePage.request.delete(`/api/v1/groups/${groupId}/invite`),
      outsiderPage.request.post(`/api/v1/invites/${token}/accept`),
    ])
    expect(revokeResponse.status()).toBe(200)
    expect([200, 404]).toContain(acceptResponse.status())
    expect((await outsiderPage.request.get(`/api/v1/invites/${token}`)).status()).toBe(404)
    expect((await outsiderPage.request.post(`/api/v1/invites/${token}/accept`)).status()).toBe(404)

    const group = await apiJson<{ group: { members: Array<{ userId: string }> } }>(
      alicePage,
      `/api/v1/groups/${groupId}`
    )
    expect(group.group.members.filter(({ userId }) => userId === outsiderId)).toHaveLength(
      acceptResponse.status() === 200 ? 1 : 0
    )

    await outsiderContext.close()
    await aliceContext.close()
  })
})
