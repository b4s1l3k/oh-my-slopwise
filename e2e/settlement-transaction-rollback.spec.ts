import { expect, test, type Browser, type Page } from "@playwright/test"
import {
  apiJson,
  authenticatedContext,
  createExpense,
  createGroup,
  userId,
  users,
} from "./helpers"

test.describe("settlement transaction rollback", () => {
  test("failed settlements preserve balances, operations, activity and lifetime statistics", async ({
    browser,
  }) => {
    const fixture = await debtFixture(browser, "Settlement failures rollback E2E", 2_000)
    const before = await settlementState(fixture.bobPage, fixture.groupId)
    const invalidCommands = [
      { ...fixture.command, amount: 1_001 },
      { ...fixture.command, toUserId: fixture.carolId, amount: 1 },
      { ...fixture.command, toUserId: fixture.bobId, amount: 1 },
    ]
    const expectedCodes = ["AMOUNT_EXCEEDS_DEBT", "RECIPIENT_NOT_MEMBER", "SELF_SETTLEMENT"]

    for (let index = 0; index < invalidCommands.length; index += 1) {
      const response = await fixture.bobPage.request.post("/api/v1/settlements", {
        data: invalidCommands[index],
      })
      expect(response.status(), await response.text()).toBe(422)
      await expect(response.json()).resolves.toMatchObject({
        error: { code: expectedCodes[index] },
      })
      expect(await settlementState(fixture.bobPage, fixture.groupId)).toEqual(before)
    }

    await fixture.close()
  })

  test("accepts the maximum money value as one exact settlement", async ({ browser }) => {
    const fixture = await debtFixture(browser, "Maximum settlement E2E", 2_000_000_000, true)

    const response = await apiJson<{ settlement: { amount: number; amountBase: number } }>(
      fixture.bobPage,
      "/api/v1/settlements",
      {
        method: "POST",
        expectedStatus: 201,
        body: { ...fixture.command, amount: 2_000_000_000 },
      }
    )

    expect(response.settlement).toMatchObject({ amount: 2_000_000_000, amountBase: 2_000_000_000 })
    const state = await settlementState(fixture.bobPage, fixture.groupId)
    expect((state.balances as { balances: { simplified: unknown[] } }).balances.simplified).toEqual([])

    await fixture.close()
  })

  test("accepts a one-minor-unit debt and settles it exactly", async ({ browser }) => {
    const fixture = await debtFixture(browser, "Minimum settlement E2E", 1, true)

    const response = await apiJson<{ settlement: { amount: number; amountBase: number } }>(
      fixture.bobPage,
      "/api/v1/settlements",
      {
        method: "POST",
        expectedStatus: 201,
        body: { ...fixture.command, amount: 1 },
      }
    )

    expect(response.settlement).toMatchObject({ amount: 1, amountBase: 1 })
    const state = await settlementState(fixture.bobPage, fixture.groupId)
    expect((state.balances as { balances: { simplified: unknown[] } }).balances.simplified).toEqual([])

    await fixture.close()
  })
})

async function debtFixture(
  browser: Browser,
  name: string,
  debtAmount: number,
  bobOnlySplit = false
) {
  const aliceContext = await authenticatedContext(browser, users.alice)
  const alicePage = aliceContext.pages()[0]
  const aliceId = (await apiJson<{ user: { id: string } }>(alicePage, "/api/v1/users/me")).user.id
  const bobId = await userId(alicePage, "Боб")
  const carolId = await userId(alicePage, "Карина")
  const groupId = await createGroup(alicePage, { name, memberIds: [bobId] })
  await createExpense(alicePage, groupId, {
    title: `${name} debt`,
    amount: bobOnlySplit ? debtAmount : debtAmount,
    currency: "RUB",
    date: "2026-09-13",
    paidById: aliceId,
    splitType: "EXACT",
    splits: bobOnlySplit
      ? [{ userId: bobId, amount: debtAmount }]
      : [
          { userId: aliceId, amount: debtAmount / 2 },
          { userId: bobId, amount: debtAmount / 2 },
        ],
  })
  const bobContext = await authenticatedContext(browser, users.bob)
  const bobPage = bobContext.pages()[0]

  return {
    bobPage,
    bobId,
    carolId,
    groupId,
    command: {
      groupId,
      toUserId: aliceId,
      amount: debtAmount,
      currency: "RUB",
      date: "2026-09-13",
    },
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
