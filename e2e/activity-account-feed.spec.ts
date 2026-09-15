import { expect, test, type Page } from "@playwright/test"
import {
  apiJson,
  authenticatedContext,
  createGroup,
  login,
  users,
} from "./helpers"

type AccountActivityPage = {
  activities: Array<{
    id: string
    groupId: string
    type: string
    metadata: Record<string, unknown>
    createdAt: string
    group: { id: string; name: string }
  }>
  nextCursor: string | null
}

const isolatedPassword = "E2e-password-123"

test.describe("account activity feed", () => {
  test("paginates a private account feed without duplicates or omissions", async ({ page }) => {
    await registerAndLogin(
      page,
      "activity.pagination.e2e@example.com",
      "Activity Pagination E2E"
    )
    const groupId = await createGroup(page, { name: "Account Activity Page 0" })
    const expectedNames = []
    for (let index = 1; index <= 4; index += 1) {
      const name = `Account Activity Page ${index}`
      expectedNames.push(name)
      await apiJson(page, `/api/v1/groups/${groupId}`, {
        method: "PATCH",
        body: { name },
      })
    }

    const first = await apiJson<AccountActivityPage>(page, "/api/v1/activity?limit=2")
    expect(first.activities).toHaveLength(2)
    expect(first.nextCursor).toEqual(expect.any(String))
    expect(first.nextCursor).not.toContain(first.activities[1].createdAt)

    const second = await apiJson<AccountActivityPage>(
      page,
      `/api/v1/activity?limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`
    )
    const combined = [...first.activities, ...second.activities]

    expect(second.activities).toHaveLength(2)
    expect(second.nextCursor).toBeNull()
    expect(new Set(combined.map((activity) => activity.id)).size).toBe(4)
    expect(combined.map((activity) => activity.metadata.name)).toEqual(expectedNames.reverse())
    expect(combined.every((activity) => activity.groupId === groupId)).toBe(true)
    expect(combined.every((activity) => activity.group.id === groupId)).toBe(true)
    expect(combined.every((activity) => activity.group.name === "Account Activity Page 4"))
      .toBe(true)
  })

  test("rejects malformed cursors and every out-of-range or non-integer limit", async ({ page }) => {
    await login(page, users.alice)

    for (const limit of ["0", "51", "-1", "1.5", "01", "Infinity", ""]) {
      const response = await page.request.get(
        `/api/v1/activity?limit=${encodeURIComponent(limit)}`
      )
      expect(response.status()).toBe(400)
      expect(await response.json()).toEqual({
        error: {
          code: "INVALID_PAGE_SIZE",
          message: "Некорректный размер страницы",
        },
      })
    }

    const cursorResponse = await page.request.get("/api/v1/activity?cursor=not-a-cursor")
    expect(cursorResponse.status()).toBe(400)
    expect(await cursorResponse.json()).toEqual({
      error: {
        code: "INVALID_CURSOR",
        message: "Некорректный курсор пагинации",
      },
    })
  })

  test("excludes the complete history of a group after the current user leaves", async ({ browser }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const registered = await apiJson<{ user: { id: string } }>(
      alicePage,
      "/api/v1/users/register",
      {
        method: "POST",
        expectedStatus: 201,
        body: {
          email: "activity.inactive.e2e@example.com",
          name: "Activity Inactive E2E",
          password: isolatedPassword,
        },
      }
    )
    const groupId = await createGroup(alicePage, {
      name: "Inactive Account Activity E2E",
      memberIds: [registered.user.id],
    })
    await apiJson(alicePage, `/api/v1/groups/${groupId}`, {
      method: "PATCH",
      body: { name: "Inactive Account Activity Renamed E2E" },
    })
    await apiJson(alicePage, `/api/v1/groups/${groupId}/members?userId=${registered.user.id}`, {
      method: "DELETE",
    })

    const memberContext = await authenticatedContext(browser, {
      email: "activity.inactive.e2e@example.com",
    })
    const memberPage = memberContext.pages()[0]
    const feed = await apiJson<AccountActivityPage>(memberPage, "/api/v1/activity")

    expect(feed.activities.some((activity) => activity.groupId === groupId)).toBe(false)
    await memberContext.close()
    await aliceContext.close()
  })

  test("loads the activity page with one batch request and no per-group fan-out", async ({ page }) => {
    await registerAndLogin(
      page,
      "activity.request-count.e2e@example.com",
      "Activity Request Count E2E"
    )
    const groupId = await createGroup(page, { name: "Activity Request Count E2E" })
    await apiJson(page, `/api/v1/groups/${groupId}`, {
      method: "PATCH",
      body: { name: "Activity Request Count Renamed E2E" },
    })

    const accountRequests: string[] = []
    const perGroupRequests: string[] = []
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname
      if (pathname === "/api/v1/activity") accountRequests.push(request.url())
      if (/^\/api\/v1\/groups\/[^/]+\/activity$/.test(pathname)) {
        perGroupRequests.push(request.url())
      }
    })

    await page.goto("/activity")
    await expect(
      page.getByRole("heading", { name: "Activity Request Count Renamed E2E" })
    ).toBeVisible()

    expect(accountRequests).toHaveLength(1)
    expect(perGroupRequests).toEqual([])
  })

  test("keeps the first fifty rows and recovers after the next page exhausts query retry", async ({ page }) => {
    test.setTimeout(90_000)
    await registerAndLogin(
      page,
      "activity.recovery.e2e@example.com",
      "Activity Recovery E2E"
    )
    const groupId = await createGroup(page, { name: "Activity Recovery 0" })
    for (let index = 1; index <= 51; index += 1) {
      await apiJson(page, `/api/v1/groups/${groupId}`, {
        method: "PATCH",
        body: { name: `Activity Recovery ${index}` },
      })
    }

    let cursorAttempts = 0
    let failuresRemaining = 2
    await page.route(/\/api\/v1\/activity(?:\?.*)?$/, async (route) => {
      const cursor = new URL(route.request().url()).searchParams.get("cursor")
      if (cursor && failuresRemaining > 0) {
        cursorAttempts += 1
        failuresRemaining -= 1
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { message: "Injected next-page failure" } }),
        })
        return
      }
      if (cursor) cursorAttempts += 1
      await route.continue()
    })

    await page.goto("/activity")
    const rows = page.locator("ol li")
    await expect(rows).toHaveCount(50)
    await expect(page.getByText(/Activity Recovery 51»$/)).toBeVisible()
    await expect(page.getByText(/Activity Recovery 1»$/)).toHaveCount(0)

    await page.getByRole("button", { name: "Показать ещё" }).click()
    await expect(page.getByText("Не удалось загрузить активность. Попробуйте ещё раз."))
      .toBeVisible()
    expect(cursorAttempts).toBe(2)
    await expect(rows).toHaveCount(50)
    await expect(page.getByText(/Activity Recovery 51»$/)).toBeVisible()

    await page.getByRole("button", { name: "Показать ещё" }).click()
    await expect(rows).toHaveCount(51)
    await expect(page.getByText(/Activity Recovery 1»$/)).toBeVisible()
    await expect(page.getByText("Не удалось загрузить активность. Попробуйте ещё раз."))
      .toHaveCount(0)
    await expect(page.getByRole("button", { name: "Показать ещё" })).toHaveCount(0)
    expect(cursorAttempts).toBe(3)
  })
})

async function registerAndLogin(page: Page, email: string, name: string): Promise<void> {
  await apiJson(page, "/api/v1/users/register", {
    method: "POST",
    expectedStatus: 201,
    body: { email, name, password: isolatedPassword },
  })
  await login(page, { email }, isolatedPassword)
}
