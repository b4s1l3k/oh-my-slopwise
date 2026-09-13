import { expect, test } from "@playwright/test"
import {
  apiJson,
  authenticatedContext,
  collectRuntimeErrors,
  expectNoRuntimeErrorsAfterSettling,
  createExpense,
  createGroup,
  login,
  userId,
  users,
} from "./helpers"

test.describe("malicious payload and authorization boundaries", () => {
  test("ignores profile mass-assignment fields and does not grant the global admin role", async ({
    page,
  }) => {
    await login(page, users.bob)
    const before = await apiJson<{ user: { id: string; email: string } }>(page, "/api/v1/users/me")

    const response = await page.request.patch("/api/v1/users/me", {
      data: {
        name: users.bob.name,
        id: "forged-user-id",
        email: users.admin.email,
        role: "ADMIN",
        passwordHash: "forged-hash",
        createdAt: "2000-01-01T00:00:00.000Z",
      },
    })
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.user).toMatchObject({ id: before.user.id, email: users.bob.email })
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|forged-hash/)

    const adminResponse = await page.request.get("/api/v1/admin/feedback")
    expect(adminResponse.status()).toBe(403)
    expect(await adminResponse.json()).toEqual({ error: "Forbidden" })
  })

  test("derives expense and settlement ownership from URL and session instead of forged fields", async ({
    browser,
  }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const aliceId = (await apiJson<{ user: { id: string } }>(alicePage, "/api/v1/users/me")).user.id
    const bobId = await userId(alicePage, "Боб")
    const groupId = await createGroup(alicePage, {
      name: "Forged ownership E2E",
      memberIds: [bobId],
    })
    const otherGroupId = await createGroup(alicePage, { name: "Forged target E2E" })
    const bobContext = await authenticatedContext(browser, users.bob)
    const bobPage = bobContext.pages()[0]

    const createResponse = await bobPage.request.post(`/api/v1/groups/${groupId}/expenses`, {
      data: {
        title: "Forged metadata expense",
        amount: 2_000,
        currency: "RUB",
        date: "2026-09-13",
        paidById: aliceId,
        splitType: "EQUAL",
        splits: [{ userId: aliceId }, { userId: bobId }],
        id: "attacker-controlled-id",
        groupId: otherGroupId,
        createdById: aliceId,
        amountBase: 1,
        settlements: [{ fromUserId: aliceId, toUserId: bobId, amount: 2_000 }],
      },
    })
    expect(createResponse.status(), await createResponse.text()).toBe(201)
    const created = await createResponse.json() as {
      expense: { id: string; groupId: string; createdById: string; amountBase: number; settlements: unknown[] }
    }
    expect(created.expense).toMatchObject({
      groupId,
      createdById: bobId,
      amountBase: 2_000,
      settlements: [],
    })
    expect(created.expense.id).not.toBe("attacker-controlled-id")

    const settlementResponse = await bobPage.request.post("/api/v1/settlements", {
      data: {
        groupId,
        toUserId: aliceId,
        amount: 1_000,
        currency: "USD",
        date: "2026-09-13",
        fromUserId: aliceId,
        expenseId: created.expense.id,
        amountBase: 1,
      },
    })
    expect(settlementResponse.status(), await settlementResponse.text()).toBe(201)
    await expect(settlementResponse.json()).resolves.toMatchObject({
      settlement: {
        groupId,
        expenseId: null,
        fromUserId: bobId,
        toUserId: aliceId,
        amount: 1_000,
        amountBase: 1_000,
        currency: "RUB",
      },
    })

    await bobContext.close()
    await aliceContext.close()
  })

  test("renders stored HTML and script-like group names as inert text", async ({ page }) => {
    const errors = collectRuntimeErrors(page)
    await login(page, users.alice)
    const payload = `<img src=x onerror="document.body.dataset.e2eXss='owned'">`
    const groupId = await createGroup(page, { name: payload })

    await page.goto(`/groups/${groupId}`)
    await expect(page.getByRole("heading", { name: payload })).toBeVisible()
    expect(await page.locator('img[src="x"]').count()).toBe(0)
    expect(await page.locator("body").getAttribute("data-e2e-xss")).toBeNull()
    await expectNoRuntimeErrorsAfterSettling(page, errors)
  })

  test("rejects SQL-like search and encoded path traversal without leaking protected records", async ({
    browser,
  }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const groupId = await createGroup(alicePage, { name: "Injection target E2E" })
    const outsiderContext = await authenticatedContext(browser, users.outsider)
    const outsiderPage = outsiderContext.pages()[0]

    const search = await apiJson<{ users: unknown[] }>(
      outsiderPage,
      `/api/v1/users/search?q=${encodeURIComponent("%' OR 1=1 --")}`
    )
    expect(search.users).toEqual([])
    const traversal = encodeURIComponent(`../${groupId}`)
    expect((await outsiderPage.request.get(`/api/v1/groups/${traversal}`)).status()).toBe(404)
    expect((await outsiderPage.request.get(`/api/v1/groups/${groupId}`)).status()).toBe(404)

    await outsiderContext.close()
    await aliceContext.close()
  })

  test("keeps persisted expense data unchanged after malicious validation failures", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const groupId = await createGroup(page, { name: "Validation rollback E2E" })
    const expense = await createExpense(page, groupId, {
      title: "Before rejected update",
      amount: 1_000,
      currency: "RUB",
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }],
    })
    const before = await apiJson(page, `/api/v1/expenses/${expense.id}`)

    const malicious = await page.request.patch(`/api/v1/expenses/${expense.id}`, {
      data: {
        title: "<script>throw new Error('owned')</script>",
        amount: 9e99,
        currency: "__proto__",
        date: "../../etc/passwd",
        paidById: { $ne: "" },
        splitType: "EQUAL",
        splits: [{ userId: aliceId }],
      },
    })
    expect(malicious.status()).toBe(422)
    expect(await apiJson(page, `/api/v1/expenses/${expense.id}`)).toEqual(before)
  })
})
