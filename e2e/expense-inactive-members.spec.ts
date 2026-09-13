import { expect, test, type Browser, type Page } from "@playwright/test"
import {
  apiJson,
  authenticatedContext,
  createExpense,
  createGroup,
  userId,
  users,
} from "./helpers"

type InactiveMemberFixture = {
  alicePage: Page
  bobPage: Page
  close: () => Promise<void>
  aliceId: string
  bobId: string
  groupId: string
  expenseId: string
}

test.describe("expense operations with inactive members", () => {
  test("rolls back an edit that would recreate debt for a former participant", async ({ browser }) => {
    const fixture = await settledExpenseWithInactiveBob(browser, "Inactive edit rollback E2E")

    const before = await financialState(fixture.alicePage, fixture.groupId, fixture.expenseId)
    const response = await fixture.alicePage.request.patch(`/api/v1/expenses/${fixture.expenseId}`, {
      data: {
        title: "Must not be persisted",
        amount: 1_200,
        currency: "RUB",
        date: "2026-09-14",
        paidById: fixture.aliceId,
        splitType: "EQUAL",
        splits: [{ userId: fixture.aliceId }],
      },
    })

    expect(response.status(), await response.text()).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INACTIVE_MEMBER_HAS_BALANCE" },
    })
    expect(await financialState(fixture.alicePage, fixture.groupId, fixture.expenseId)).toEqual(before)

    await fixture.close()
  })

  test("rolls back deletion of a historic expense that keeps a former member settled", async ({ browser }) => {
    const fixture = await settledExpenseWithInactiveBob(browser, "Inactive delete rollback E2E")

    const before = await financialState(fixture.alicePage, fixture.groupId, fixture.expenseId)
    const response = await fixture.alicePage.request.delete(`/api/v1/expenses/${fixture.expenseId}`)

    expect(response.status(), await response.text()).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INACTIVE_MEMBER_HAS_BALANCE" },
    })
    expect(await financialState(fixture.alicePage, fixture.groupId, fixture.expenseId)).toEqual(before)

    await fixture.close()
  })

  test("rejects inactive users as a new payer or split participant without a partial expense", async ({ browser }) => {
    const fixture = await settledExpenseWithInactiveBob(browser, "Inactive create guards E2E")
    const before = await apiJson<unknown>(
      fixture.alicePage,
      `/api/v1/groups/${fixture.groupId}/expenses`
    )
    const base = {
      title: "Must not be created",
      amount: 100,
      currency: "RUB",
      date: "2026-09-15",
      splitType: "EQUAL" as const,
    }

    const inactivePayer = await fixture.alicePage.request.post(
      `/api/v1/groups/${fixture.groupId}/expenses`,
      {
        data: {
          ...base,
          paidById: fixture.bobId,
          splits: [{ userId: fixture.aliceId }],
        },
      }
    )
    expect(inactivePayer.status(), await inactivePayer.text()).toBe(422)
    await expect(inactivePayer.json()).resolves.toMatchObject({ error: { code: "PAYER_NOT_MEMBER" } })

    const inactiveSplit = await fixture.alicePage.request.post(
      `/api/v1/groups/${fixture.groupId}/expenses`,
      {
        data: {
          ...base,
          paidById: fixture.aliceId,
          splits: [{ userId: fixture.bobId }],
        },
      }
    )
    expect(inactiveSplit.status(), await inactiveSplit.text()).toBe(422)
    await expect(inactiveSplit.json()).resolves.toMatchObject({
      error: { code: "SPLIT_USER_NOT_MEMBER" },
    })
    expect(await apiJson(fixture.alicePage, `/api/v1/groups/${fixture.groupId}/expenses`)).toEqual(before)

    await fixture.close()
  })

  test("blocks an inactive original author from reading or mutating the old expense", async ({ browser }) => {
    const fixture = await settledExpenseWithInactiveBob(
      browser,
      "Inactive author permissions E2E",
      true
    )
    const before = await financialState(fixture.alicePage, fixture.groupId, fixture.expenseId)
    const editBody = {
      title: "Former author edit",
      amount: 1_000,
      currency: "RUB",
      date: "2026-09-13",
      paidById: fixture.aliceId,
      splitType: "EQUAL",
      splits: [{ userId: fixture.aliceId }],
    }

    expect((await fixture.bobPage.request.get(`/api/v1/expenses/${fixture.expenseId}`)).status()).toBe(404)
    const update = await fixture.bobPage.request.patch(`/api/v1/expenses/${fixture.expenseId}`, {
      data: editBody,
    })
    expect(update.status()).toBe(403)
    await expect(update.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } })
    const deletion = await fixture.bobPage.request.delete(`/api/v1/expenses/${fixture.expenseId}`)
    expect(deletion.status()).toBe(403)
    await expect(deletion.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } })
    expect(await financialState(fixture.alicePage, fixture.groupId, fixture.expenseId)).toEqual(before)

    await fixture.close()
  })
})

async function settledExpenseWithInactiveBob(
  browser: Browser,
  groupName: string,
  bobCreatesExpense = false
): Promise<InactiveMemberFixture> {
  const aliceContext = await authenticatedContext(browser, users.alice)
  const alicePage = aliceContext.pages()[0]
  const aliceId = (await apiJson<{ user: { id: string } }>(alicePage, "/api/v1/users/me")).user.id
  const bobId = await userId(alicePage, "Боб")
  const groupId = await createGroup(alicePage, { name: groupName, memberIds: [bobId] })
  const bobContext = await authenticatedContext(browser, users.bob)
  const bobPage = bobContext.pages()[0]
  const expense = await createExpense(bobCreatesExpense ? bobPage : alicePage, groupId, {
    title: "Settled expense before exit",
    amount: 1_000,
    currency: "RUB",
    date: "2026-09-13",
    paidById: aliceId,
    splitType: "EQUAL",
    splits: [{ userId: aliceId }, { userId: bobId }],
  })
  await apiJson(bobPage, "/api/v1/settlements", {
    method: "POST",
    expectedStatus: 201,
    body: {
      groupId,
      toUserId: aliceId,
      amount: 500,
      currency: "RUB",
      date: "2026-09-13",
    },
  })
  await apiJson(bobPage, `/api/v1/groups/${groupId}/members?userId=${bobId}`, {
    method: "DELETE",
  })
  const settledBalances = await apiJson<{
    balances: { raw: Array<{ balance: number }>; simplified: unknown[] }
  }>(alicePage, `/api/v1/groups/${groupId}/balances`)
  expect(settledBalances.balances.simplified).toEqual([])
  expect(settledBalances.balances.raw.every((balance) => balance.balance === 0)).toBe(true)

  return {
    alicePage,
    bobPage,
    aliceId,
    bobId,
    groupId,
    expenseId: expense.id,
    close: async () => {
      await bobContext.close()
      await aliceContext.close()
    },
  }
}

async function financialState(page: Page, groupId: string, expenseId: string) {
  const [expense, expenses, balances, settlements, activity, statistics] = await Promise.all([
    apiJson(page, `/api/v1/expenses/${expenseId}`),
    apiJson(page, `/api/v1/groups/${groupId}/expenses`),
    apiJson(page, `/api/v1/groups/${groupId}/balances`),
    apiJson(page, `/api/v1/groups/${groupId}/settlements`),
    apiJson(page, `/api/v1/groups/${groupId}/activity`),
    apiJson(page, "/api/v1/users/me/statistics"),
  ])
  return { expense, expenses, balances, settlements, activity, statistics }
}
