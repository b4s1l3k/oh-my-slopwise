import { expect, test, type Page } from "@playwright/test"
import { apiJson, createGroup, login, userId, users } from "./helpers"

test.describe("expense HTTP validation", () => {
  test("rejects malformed top-level expense fields", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const groupId = await createGroup(page, { name: "Expense Field Validation E2E" })
    const valid = baseExpense(aliceId)
    const invalidCases = [
      null,
      { ...valid, title: "" },
      { ...valid, title: "x".repeat(256) },
      { ...valid, amount: 0 },
      { ...valid, amount: -1 },
      { ...valid, amount: 1.5 },
      { ...valid, amount: 2_000_000_001 },
      { ...valid, currency: "BTC" },
      { ...valid, notes: "x".repeat(1_001) },
      { ...valid, date: "2026-02-30" },
      { ...valid, date: "13.09.2026" },
      { ...valid, paidById: "" },
      { ...valid, splits: [] },
      { ...valid, splitType: "CUSTOM" },
    ]

    for (const body of invalidCases) {
      await expectValidationError(page, groupId, body)
    }
  })

  test("rejects invalid exact and percentage split matrices", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, {
      name: "Expense Split Validation E2E",
      memberIds: [bobId],
    })
    const valid = baseExpense(aliceId)
    const invalidCases = [
      { ...valid, splits: [{ userId: aliceId }, { userId: aliceId }] },
      {
        ...valid,
        splitType: "EXACT",
        splits: [{ userId: aliceId, amount: 60 }, { userId: bobId, amount: 30 }],
      },
      {
        ...valid,
        splitType: "EXACT",
        splits: [{ userId: aliceId, amount: 100 }, { userId: bobId, amount: 0 }],
      },
      {
        ...valid,
        splitType: "PERCENTAGE",
        splits: [
          { userId: aliceId, percentage: 5_000 },
          { userId: bobId, percentage: 4_999 },
        ],
      },
      {
        ...valid,
        splitType: "PERCENTAGE",
        splits: [
          { userId: aliceId, percentage: 10_000 },
          { userId: bobId, percentage: 0 },
        ],
      },
    ]

    for (const body of invalidCases) {
      await expectValidationError(page, groupId, body)
    }
  })

  test("rejects non-member payer and split participant with stable error codes", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const outsiderId = await userId(page, "Внешний")
    const groupId = await createGroup(page, { name: "Expense Membership Validation E2E" })

    await expectDomainError(page, groupId, {
      ...baseExpense(aliceId),
      paidById: outsiderId,
    }, "PAYER_NOT_MEMBER")
    await expectDomainError(page, groupId, {
      ...baseExpense(aliceId),
      splits: [{ userId: outsiderId }],
    }, "SPLIT_USER_NOT_MEMBER")
  })

  test("validates expense-list page query parameters", async ({ page }) => {
    await login(page, users.alice)
    const groupId = await createGroup(page, { name: "Expense Page Validation E2E" })

    for (const query of ["page=0", "page=-1", "page=1.5", "page=NaN", "page=100001"]) {
      const response = await page.request.get(`/api/v1/groups/${groupId}/expenses?${query}`)
      expect(response.status(), query).toBe(400)
      await expect(response.json()).resolves.toEqual({ error: "Invalid page" })
    }
  })
})

function baseExpense(userId: string) {
  return {
    title: "Valid expense",
    amount: 100,
    currency: "RUB",
    date: "2026-09-13",
    paidById: userId,
    splitType: "EQUAL",
    splits: [{ userId }],
  }
}

async function expectValidationError(page: Page, groupId: string, body: unknown) {
  const response = await page.request.post(`/api/v1/groups/${groupId}/expenses`, { data: body })
  expect(response.status(), JSON.stringify(body)).toBe(422)
  const payload = await response.json() as { error?: unknown }
  expect(payload.error).toBeTruthy()
}

async function expectDomainError(page: Page, groupId: string, body: unknown, code: string) {
  const response = await page.request.post(`/api/v1/groups/${groupId}/expenses`, { data: body })
  expect(response.status(), await response.text()).toBe(422)
  await expect(response.json()).resolves.toMatchObject({ error: { code } })
}
