import { expect, test, type Page } from "@playwright/test"
import {
  apiJson,
  authenticatedContext,
  createExpense,
  createGroup,
  login,
  userId,
  users,
} from "./helpers"

type SettlementDto = {
  id: string
  groupId: string
  expenseId: string | null
  fromUserId: string
  toUserId: string
  amount: number
  amountBase: number | null
  currency: string
  date: string
  notes: string | null
}

async function createDebt(page: Page, name: string) {
  const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
  const bobId = await userId(page, "Боб")
  const groupId = await createGroup(page, { name, memberIds: [bobId] })
  await createExpense(page, groupId, {
    title: `${name} expense`,
    amount: 2_000,
    currency: "RUB",
    date: "2026-01-31",
    paidById: aliceId,
    splitType: "EQUAL",
    splits: [{ userId: aliceId }, { userId: bobId }],
  })
  return { aliceId, bobId, groupId }
}

test.describe("settlement API", () => {
  test("persists a partial settlement, notes and the literal calendar date", async ({ browser }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const { bobId, groupId } = await createDebt(alicePage, "Settlement fields E2E")
    const bobContext = await authenticatedContext(browser, users.bob)
    const bobPage = bobContext.pages()[0]

    const response = await apiJson<{ settlement: SettlementDto }>(bobPage, "/api/v1/settlements", {
      method: "POST",
      expectedStatus: 201,
      body: {
        groupId,
        toUserId: (await apiJson<{ user: { id: string } }>(alicePage, "/api/v1/users/me")).user.id,
        amount: 400,
        currency: "USD",
        date: "2024-02-29",
        notes: "Partial transfer",
      },
    })

    expect(response.settlement).toMatchObject({
      groupId,
      expenseId: null,
      fromUserId: bobId,
      amount: 400,
      amountBase: 400,
      currency: "RUB",
      date: "2024-02-29T00:00:00.000Z",
      notes: "Partial transfer",
    })
    const list = await apiJson<{ settlements: SettlementDto[] }>(
      bobPage,
      `/api/v1/groups/${groupId}/settlements`
    )
    expect(list.settlements).toHaveLength(1)
    expect(list.settlements[0]).toMatchObject(response.settlement)

    await bobContext.close()
    await aliceContext.close()
  })

  test("rejects self-settlement and settlement without debt", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, {
      name: "No settlement debt E2E",
      memberIds: [bobId],
    })

    const self = await page.request.post("/api/v1/settlements", {
      data: {
        groupId,
        toUserId: aliceId,
        amount: 100,
        currency: "RUB",
        date: "2026-09-13",
      },
    })
    expect(self.status()).toBe(422)
    expect(await self.json()).toMatchObject({ error: { code: "SELF_SETTLEMENT" } })

    const noDebt = await page.request.post("/api/v1/settlements", {
      data: {
        groupId,
        toUserId: bobId,
        amount: 100,
        currency: "RUB",
        date: "2026-09-13",
      },
    })
    expect(noDebt.status()).toBe(422)
    expect(await noDebt.json()).toMatchObject({ error: { code: "NO_DEBT" } })
  })

  test("rejects an amount greater than the current debt without changing balances", async ({ browser }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const { aliceId, groupId } = await createDebt(alicePage, "Excess settlement E2E")
    const before = await apiJson<unknown>(alicePage, `/api/v1/groups/${groupId}/balances`)
    const bobContext = await authenticatedContext(browser, users.bob)
    const bobPage = bobContext.pages()[0]

    const response = await bobPage.request.post("/api/v1/settlements", {
      data: {
        groupId,
        toUserId: aliceId,
        amount: 1_001,
        currency: "RUB",
        date: "2026-09-13",
      },
    })
    expect(response.status()).toBe(422)
    expect(await response.json()).toMatchObject({ error: { code: "AMOUNT_EXCEEDS_DEBT" } })
    expect(await apiJson(alicePage, `/api/v1/groups/${groupId}/balances`)).toEqual(before)

    await bobContext.close()
    await aliceContext.close()
  })

  test("rejects non-members as sender and recipient", async ({ browser }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const { aliceId, groupId } = await createDebt(alicePage, "Settlement membership E2E")
    const outsiderId = await userId(alicePage, "Внешний")

    const recipient = await alicePage.request.post("/api/v1/settlements", {
      data: {
        groupId,
        toUserId: outsiderId,
        amount: 100,
        currency: "RUB",
        date: "2026-09-13",
      },
    })
    expect(recipient.status()).toBe(422)
    expect(await recipient.json()).toMatchObject({ error: { code: "RECIPIENT_NOT_MEMBER" } })

    const outsiderContext = await authenticatedContext(browser, users.outsider)
    const outsiderPage = outsiderContext.pages()[0]
    const sender = await outsiderPage.request.post("/api/v1/settlements", {
      data: {
        groupId,
        toUserId: aliceId,
        amount: 100,
        currency: "RUB",
        date: "2026-09-13",
      },
    })
    expect(sender.status()).toBe(403)
    expect(await sender.json()).toMatchObject({ error: { code: "FORBIDDEN" } })
    expect((await outsiderPage.request.get(`/api/v1/groups/${groupId}/settlements`)).status()).toBe(403)

    await outsiderContext.close()
    await aliceContext.close()
  })

  test("validates amount, date, recipient, notes and body shape", async ({ page }) => {
    await login(page, users.alice)
    const invalidBodies = [
      null,
      {},
      { groupId: "g", toUserId: "u", amount: 0, currency: "RUB", date: "2026-09-13" },
      { groupId: "g", toUserId: "u", amount: 1.5, currency: "RUB", date: "2026-09-13" },
      { groupId: "g", toUserId: "u", amount: 2_000_000_001, currency: "RUB", date: "2026-09-13" },
      { groupId: "g", toUserId: "", amount: 100, currency: "RUB", date: "2026-09-13" },
      { groupId: "g", toUserId: "u", amount: 100, currency: "RU", date: "2026-09-13" },
      { groupId: "g", toUserId: "u", amount: 100, currency: "RUB", date: "2025-02-29" },
      {
        groupId: "g",
        toUserId: "u",
        amount: 100,
        currency: "RUB",
        date: "2026-09-13",
        notes: "x".repeat(501),
      },
    ]

    for (const body of invalidBodies) {
      const response = await page.request.post("/api/v1/settlements", { data: body })
      expect(response.status(), JSON.stringify(body)).toBe(422)
    }
  })

  test("admin reset removes manual settlements and is idempotent", async ({ browser }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const { aliceId, groupId } = await createDebt(alicePage, "Reset settlements E2E")
    const bobContext = await authenticatedContext(browser, users.bob)
    const bobPage = bobContext.pages()[0]
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

    expect(
      (await apiJson<{ settlements: SettlementDto[] }>(alicePage, `/api/v1/groups/${groupId}/settlements`))
        .settlements
    ).toHaveLength(1)
    expect(await apiJson(alicePage, `/api/v1/groups/${groupId}/settlements`, { method: "DELETE" }))
      .toEqual({ removed: 1 })
    expect(await apiJson(alicePage, `/api/v1/groups/${groupId}/settlements`, { method: "DELETE" }))
      .toEqual({ removed: 0 })
    expect(
      (await apiJson<{ settlements: SettlementDto[] }>(alicePage, `/api/v1/groups/${groupId}/settlements`))
        .settlements
    ).toEqual([])

    await bobContext.close()
    await aliceContext.close()
  })
})
