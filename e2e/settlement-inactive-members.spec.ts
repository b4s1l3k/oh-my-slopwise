import { expect, test, type Browser, type Page } from "@playwright/test"
import {
  apiJson,
  authenticatedContext,
  createExpense,
  createGroup,
  userId,
  users,
} from "./helpers"

test.describe("settlements with inactive members", () => {
  test("rolls back reset when removing settlements would recreate a former member debt", async ({ browser }) => {
    const fixture = await inactiveSettledMember(browser, "Inactive reset rollback E2E")
    const before = await settlementState(fixture.alicePage, fixture.groupId)

    const response = await fixture.alicePage.request.delete(
      `/api/v1/groups/${fixture.groupId}/settlements`
    )

    expect(response.status(), await response.text()).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INACTIVE_MEMBER_HAS_BALANCE" },
    })
    expect(await settlementState(fixture.alicePage, fixture.groupId)).toEqual(before)

    await fixture.close()
  })

  test("rejects an inactive settlement recipient without changing finance or history", async ({ browser }) => {
    const fixture = await inactiveSettledMember(browser, "Inactive recipient E2E")
    const before = await settlementState(fixture.alicePage, fixture.groupId)

    const response = await fixture.alicePage.request.post("/api/v1/settlements", {
      data: {
        groupId: fixture.groupId,
        toUserId: fixture.bobId,
        amount: 1,
        currency: "RUB",
        date: "2026-09-14",
      },
    })

    expect(response.status(), await response.text()).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "RECIPIENT_NOT_MEMBER" },
    })
    expect(await settlementState(fixture.alicePage, fixture.groupId)).toEqual(before)

    await fixture.close()
  })
})

async function inactiveSettledMember(browser: Browser, groupName: string) {
  const aliceContext = await authenticatedContext(browser, users.alice)
  const alicePage = aliceContext.pages()[0]
  const aliceId = (await apiJson<{ user: { id: string } }>(alicePage, "/api/v1/users/me")).user.id
  const bobId = await userId(alicePage, "Боб")
  const groupId = await createGroup(alicePage, { name: groupName, memberIds: [bobId] })
  await createExpense(alicePage, groupId, {
    title: "Debt settled before exit",
    amount: 2_000,
    currency: "RUB",
    date: "2026-09-13",
    paidById: aliceId,
    splitType: "EQUAL",
    splits: [{ userId: aliceId }, { userId: bobId }],
  })
  const bobContext = await authenticatedContext(browser, users.bob)
  const bobPage = bobContext.pages()[0]
  await apiJson(bobPage, "/api/v1/settlements", {
    method: "POST",
    expectedStatus: 201,
    body: {
      groupId,
      toUserId: aliceId,
      amount: 1_000,
      currency: "RUB",
      date: "2026-09-13",
    },
  })
  await apiJson(bobPage, `/api/v1/groups/${groupId}/members?userId=${bobId}`, {
    method: "DELETE",
  })

  return {
    alicePage,
    bobId,
    groupId,
    close: async () => {
      await bobContext.close()
      await aliceContext.close()
    },
  }
}

async function settlementState(page: Page, groupId: string) {
  const [balances, settlements, expenses, activity, statistics] = await Promise.all([
    apiJson(page, `/api/v1/groups/${groupId}/balances`),
    apiJson(page, `/api/v1/groups/${groupId}/settlements`),
    apiJson(page, `/api/v1/groups/${groupId}/expenses`),
    apiJson(page, `/api/v1/groups/${groupId}/activity`),
    apiJson(page, "/api/v1/users/me/statistics"),
  ])
  return { balances, settlements, expenses, activity, statistics }
}
