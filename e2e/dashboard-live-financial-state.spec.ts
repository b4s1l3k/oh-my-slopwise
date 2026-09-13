import { expect, test } from "@playwright/test"
import {
  apiJson,
  createExpense,
  createGroup,
  login,
  userId,
  users,
} from "./helpers"

type BalanceOverview = {
  totals: Array<{ currency: string; owed: number; owe: number }>
  friendBalances: Array<{
    userId: string
    userName: string
    balance: number
    currency: string
    groups: string[]
  }>
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount / 100)
}

test.describe("live dashboard financial state", () => {
  test("renders real API totals, friend balance and group card without route mocks", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const groupName = "Dashboard Vertical HUF E2E"
    const groupId = await createGroup(page, {
      name: groupName,
      memberIds: [bobId],
      currency: "HUF",
      type: "TRIP",
    })
    await createExpense(page, groupId, {
      title: "Dashboard live balance",
      amount: 12_000,
      currency: "HUF",
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EXACT",
      splits: [
        { userId: aliceId, amount: 7_000 },
        { userId: bobId, amount: 5_000 },
      ],
    })

    const overview = await apiJson<BalanceOverview>(page, "/api/v1/balances/overview")
    expect(overview.totals).toContainEqual({ currency: "HUF", owed: 5_000, owe: 0 })
    expect(overview.friendBalances).toContainEqual(expect.objectContaining({
      userId: bobId,
      userName: users.bob.name,
      balance: 5_000,
      currency: "HUF",
      groups: expect.arrayContaining([groupName]),
    }))

    await page.goto("/dashboard")

    const balanceCard = page.locator("div.rounded-lg.border.bg-card").filter({
      has: page.getByText("Ваш баланс", { exact: true }),
    })
    await expect(balanceCard.getByText(formatMoney(5_000, "HUF"), { exact: true })).toBeVisible()
    await expect(balanceCard.getByText(formatMoney(0, "HUF"), { exact: true })).toBeVisible()

    const friendRow = page.locator("div.rounded-lg.border.bg-card").filter({
      has: page.getByText(users.bob.name, { exact: true }),
      hasText: groupName,
    })
    await expect(friendRow.getByText(formatMoney(5_000, "HUF"), { exact: false })).toBeVisible()
    await expect(friendRow.getByText(groupName, { exact: true })).toBeVisible()

    const groupCard = page.locator(`a[href="/groups/${groupId}"]`)
    await expect(groupCard.getByText(groupName, { exact: true })).toBeVisible()
    await expect(groupCard.getByText("2 участников", { exact: true })).toBeVisible()
    await expect(groupCard.getByText("Поездка", { exact: true })).toBeVisible()
  })
})
