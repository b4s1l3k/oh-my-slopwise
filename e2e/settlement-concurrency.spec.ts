import { expect, test, type Page } from "@playwright/test"
import {
  apiJson,
  authenticatedContext,
  createExpense,
  createGroup,
  userId,
  users,
} from "./helpers"

type SettlementDto = {
  id: string
  fromUserId: string
  toUserId: string
  amount: number
}

type DebtDto = {
  fromUserId: string
  toUserId: string
  amount: number
}

async function createDebt(page: Page, name: string, amount = 2_000) {
  const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
  const bobId = await userId(page, "Боб")
  const groupId = await createGroup(page, { name, memberIds: [bobId] })
  await createExpense(page, groupId, {
    title: `${name} debt`,
    amount,
    currency: "RUB",
    date: "2026-09-13",
    paidById: aliceId,
    splitType: "EQUAL",
    splits: [{ userId: aliceId }, { userId: bobId }],
  })
  return { aliceId, bobId, groupId }
}

async function settlements(page: Page, groupId: string) {
  return (await apiJson<{ settlements: SettlementDto[] }>(
    page,
    `/api/v1/groups/${groupId}/settlements`
  )).settlements
}

async function debts(page: Page, groupId: string) {
  return (await apiJson<{ balances: { simplified: DebtDto[] } }>(
    page,
    `/api/v1/groups/${groupId}/balances`
  )).balances.simplified
}

function settlementCommand(groupId: string, toUserId: string, amount: number) {
  return {
    groupId,
    toUserId,
    amount,
    currency: "RUB",
    date: "2026-09-13",
  }
}

test.describe("concurrent settlements", () => {
  test("atomically rejects a concurrent overpayment without a partial settlement or activity", async ({
    browser,
  }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const { aliceId, bobId, groupId } = await createDebt(
      alicePage,
      "Concurrent overpayment E2E"
    )
    const bobContext = await authenticatedContext(browser, users.bob)
    const bobPage = bobContext.pages()[0]
    const command = settlementCommand(groupId, aliceId, 700)

    const responses = await Promise.all([
      bobPage.request.post("/api/v1/settlements", { data: command }),
      bobPage.request.post("/api/v1/settlements", { data: command }),
    ])

    expect(responses.map((response) => response.status()).sort()).toEqual([201, 422])
    const rejected = responses.find((response) => response.status() === 422)
    await expect(rejected?.json()).resolves.toMatchObject({
      error: { code: "AMOUNT_EXCEEDS_DEBT" },
    })
    expect(await settlements(alicePage, groupId)).toMatchObject([
      { fromUserId: bobId, toUserId: aliceId, amount: 700 },
    ])
    expect(await debts(alicePage, groupId)).toMatchObject([
      { fromUserId: bobId, toUserId: aliceId, amount: 300 },
    ])

    const activity = await apiJson<{ activities: Array<{ type: string }> }>(
      alicePage,
      `/api/v1/groups/${groupId}/activity`
    )
    expect(activity.activities.filter(({ type }) => type === "SETTLEMENT_CREATED")).toHaveLength(1)

    await bobContext.close()
    await aliceContext.close()
  })

  test("serializes two valid partial repayments and clears the debt exactly", async ({ browser }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const { aliceId, groupId } = await createDebt(alicePage, "Concurrent exact payoff E2E")
    const bobContext = await authenticatedContext(browser, users.bob)
    const bobPage = bobContext.pages()[0]
    const command = settlementCommand(groupId, aliceId, 500)

    const responses = await Promise.all([
      bobPage.request.post("/api/v1/settlements", { data: command }),
      bobPage.request.post("/api/v1/settlements", { data: command }),
    ])

    expect(responses.map((response) => response.status())).toEqual([201, 201])
    const persisted = await settlements(alicePage, groupId)
    expect(persisted).toHaveLength(2)
    expect(persisted.reduce((total, settlement) => total + settlement.amount, 0)).toBe(1_000)
    expect(await debts(alicePage, groupId)).toEqual([])

    await bobContext.close()
    await aliceContext.close()
  })

  test("keeps settlement reset and creation in a serializable final state", async ({ browser }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const { aliceId, bobId, groupId } = await createDebt(alicePage, "Concurrent reset E2E")
    const bobContext = await authenticatedContext(browser, users.bob)
    const bobPage = bobContext.pages()[0]

    const [resetResponse, createResponse] = await Promise.all([
      alicePage.request.delete(`/api/v1/groups/${groupId}/settlements`),
      bobPage.request.post("/api/v1/settlements", {
        data: settlementCommand(groupId, aliceId, 700),
      }),
    ])

    expect(resetResponse.status()).toBe(200)
    expect(createResponse.status()).toBe(201)
    const persisted = await settlements(alicePage, groupId)
    const finalDebts = await debts(alicePage, groupId)
    if (persisted.length === 0) {
      expect(finalDebts).toMatchObject([{ fromUserId: bobId, toUserId: aliceId, amount: 1_000 }])
    } else {
      expect(persisted).toMatchObject([{ fromUserId: bobId, toUserId: aliceId, amount: 700 }])
      expect(finalDebts).toMatchObject([{ fromUserId: bobId, toUserId: aliceId, amount: 300 }])
    }

    await bobContext.close()
    await aliceContext.close()
  })
})
