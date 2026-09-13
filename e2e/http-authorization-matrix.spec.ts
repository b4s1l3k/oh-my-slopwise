import { expect, test } from "@playwright/test"
import {
  authenticatedContext,
  createGroup,
  userId,
  users,
} from "./helpers"

test.describe("HTTP authorization matrix", () => {
  test("every protected route handler rejects anonymous requests", async ({ request }) => {
    const cases: Array<{ method: string; path: string; data?: unknown }> = [
      { method: "GET", path: "/api/v1/groups/unknown" },
      { method: "POST", path: "/api/v1/groups", data: {} },
      { method: "GET", path: "/api/v1/groups/unknown/expenses" },
      { method: "GET", path: "/api/v1/expenses/unknown" },
      { method: "POST", path: "/api/v1/groups/unknown/members", data: {} },
      { method: "DELETE", path: "/api/v1/groups/unknown/members?userId=unknown" },
      { method: "DELETE", path: "/api/v1/groups/unknown/invite" },
      { method: "DELETE", path: "/api/v1/groups/unknown/settlements" },
    ]

    for (const item of cases) {
      const response = await request.fetch(item.path, {
        method: item.method,
        data: item.data,
      })

      expect(response.status(), `${item.method} ${item.path}`).toBe(401)
      expect(await response.json(), `${item.method} ${item.path}`).toEqual({
        error: "Unauthorized",
      })
    }
  })

  test("regular member cannot delete a group through the API", async ({ browser }) => {
    const adminContext = await authenticatedContext(browser, users.alice)
    const adminPage = adminContext.pages()[0]
    const bobId = await userId(adminPage, "Боб")
    const groupId = await createGroup(adminPage, {
      name: "Member Group Delete Authorization E2E",
      memberIds: [bobId],
    })
    const memberContext = await authenticatedContext(browser, users.bob)
    const memberPage = memberContext.pages()[0]

    const response = await memberPage.request.delete(`/api/v1/groups/${groupId}`)

    expect(response.status()).toBe(403)
    expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } })
    expect((await adminPage.request.get(`/api/v1/groups/${groupId}`)).status()).toBe(200)

    await memberContext.close()
    await adminContext.close()
  })

  test("outsider cannot read group settlements through the API", async ({ browser }) => {
    const adminContext = await authenticatedContext(browser, users.alice)
    const adminPage = adminContext.pages()[0]
    const groupId = await createGroup(adminPage, {
      name: "Settlement Read Authorization E2E",
    })
    const outsiderContext = await authenticatedContext(browser, users.outsider)
    const outsiderPage = outsiderContext.pages()[0]

    const response = await outsiderPage.request.get(`/api/v1/groups/${groupId}/settlements`)

    expect(response.status()).toBe(403)
    expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } })

    await outsiderContext.close()
    await adminContext.close()
  })
})
