import { expect, test, type Page, type Route } from "@playwright/test"
import { login, users } from "./helpers"

const statistics = {
  money: {
    spent: [{ currency: "RUB", amount: 1_234_500 }],
    returned: [{ currency: "USD", amount: 9_999 }],
  },
  overview: {
    expensesParticipated: 12_345,
    expensesCreated: 234,
    expensesPaid: 56,
    activeGroups: 7,
  },
  splits: { equal: 4, exact: 3, percentage: 2 },
  collaboration: {
    uniquePeople: 8,
    settlementsSent: 9,
    settlementsReceived: 10,
    cashSettlements: 11,
    invitesCreated: 12,
    createdForOthers: 13,
  },
  groups: { created: 14, home: 1, trip: 2, couple: 3, other: 8 },
  mastery: { currenciesUsed: 6, splitMethodsUsed: 3, customRates: 15 },
  records: {
    maxExpenseParticipants: 16,
    maxPaidParticipants: 17,
    maxGroupMembers: 18,
    maxGroupExpenses: 19,
    accountAgeDays: 20,
  },
}

function achievement(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `achievement-${index}`,
    title: `Ачивка ${index}`,
    description: `Описание ${index}`,
    category: "ACTIVITY",
    icon: "trophy",
    unlocked: false,
    progress: index,
    target: 100,
    percent: index,
    hidden: false,
    ...overrides,
  }
}

const achievements = [
  achievement(1),
  achievement(2),
  achievement(3),
  achievement(4),
  achievement(5),
  achievement(6),
  achievement(7),
  achievement(8),
  achievement(9, { hidden: true }),
  achievement(10, { unlocked: true, progress: 100, percent: 100 }),
]

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
}

async function mockUnseen(page: Page): Promise<void> {
  await page.route("**/api/v1/users/me/achievements/unseen", (route) =>
    fulfillJson(route, { unlocked: [] })
  )
}

test.describe("profile statistics and achievements UI", () => {
  test("renders the complete lifetime statistics response", async ({ page }) => {
    await mockUnseen(page)
    await page.route("**/api/v1/users/me/statistics", (route) =>
      fulfillJson(route, { statistics })
    )

    await login(page, users.alice)
    await page.goto("/profile")

    await expect(page.getByRole("heading", { name: "Статистика" })).toBeVisible()
    await expect(page.getByText("12 345", { exact: true })).toBeVisible()
    await expect(page.getByText("Участий в тратах", { exact: true })).toBeVisible()
    await expect(page.getByText("Поровну", { exact: true })).toBeVisible()
    await expect(page.getByText("По суммам", { exact: true })).toBeVisible()
    await expect(page.getByText("По процентам", { exact: true })).toBeVisible()
    await expect(page.getByText("Создано приглашений", { exact: true })).toBeVisible()
    await expect(page.getByText("3 из 3", { exact: true })).toBeVisible()
    await expect(page.getByText("Дней с регистрации", { exact: true })).toBeVisible()
  })

  test("orders achievements and expands and collapses the full collection", async ({ page }) => {
    await mockUnseen(page)
    await page.route("**/api/v1/users/me/achievements", (route) =>
      fulfillJson(route, {
        summary: { unlocked: 1, total: achievements.length },
        achievements,
      })
    )

    await login(page, users.alice)
    await page.goto("/profile")

    await expect(page.getByText("Открыто 1 из 10", { exact: true })).toBeVisible()
    await expect(page.getByText("10%", { exact: true })).toBeVisible()
    await expect(page.getByText("Ачивка 10", { exact: true })).toBeVisible()
    await expect(page.getByText("Ачивка 1", { exact: true })).toHaveCount(0)
    await expect(page.getByText("Ачивка 2", { exact: true })).toHaveCount(0)

    await page.getByRole("button", { name: "Показать все (10)" }).click()
    await expect(page.getByText("Ачивка 1", { exact: true })).toBeVisible()
    await expect(page.getByText("Ачивка 2", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Свернуть" }).click()
    await expect(page.getByText("Ачивка 1", { exact: true })).toHaveCount(0)
  })

  test("keeps achievements available when statistics fail", async ({ page }) => {
    await mockUnseen(page)
    await page.route("**/api/v1/users/me/statistics", (route) =>
      fulfillJson(route, { error: { code: "INTERNAL_ERROR" } }, 500)
    )
    await page.route("**/api/v1/users/me/achievements", (route) =>
      fulfillJson(route, {
        summary: { unlocked: 1, total: 1 },
        achievements: [achievement(10, { unlocked: true, progress: 100, percent: 100 })],
      })
    )

    await login(page, users.alice)
    await page.goto("/profile")

    await expect(page.getByText("Не удалось загрузить статистику", { exact: true })).toBeVisible()
    await expect(page.getByText("Ачивка 10", { exact: true })).toBeVisible()
  })

  test("keeps statistics available when achievements fail", async ({ page }) => {
    await mockUnseen(page)
    await page.route("**/api/v1/users/me/statistics", (route) =>
      fulfillJson(route, { statistics })
    )
    await page.route("**/api/v1/users/me/achievements", (route) =>
      fulfillJson(route, { error: { code: "INTERNAL_ERROR" } }, 500)
    )

    await login(page, users.alice)
    await page.goto("/profile")

    await expect(page.getByText("12 345", { exact: true })).toBeVisible()
    await expect(page.getByText("Не удалось загрузить достижения", { exact: true })).toBeVisible()
  })

  test("retries statistics without reloading the profile", async ({ page }) => {
    let attempts = 0
    let recover = false
    await mockUnseen(page)
    await page.route("**/api/v1/users/me/statistics", async (route) => {
      attempts += 1
      if (!recover) {
        await fulfillJson(route, { error: { code: "INTERNAL_ERROR" } }, 500)
        return
      }
      await fulfillJson(route, { statistics })
    })

    await login(page, users.alice)
    await page.goto("/profile")
    const alert = page.getByRole("alert").filter({ hasText: "Не удалось загрузить статистику" })
    await expect(alert).toBeVisible()

    const failedAttempts = attempts
    recover = true
    await alert.getByRole("button", { name: "Повторить" }).click()
    await expect(page.getByText("12 345", { exact: true })).toBeVisible()
    await expect(alert).toHaveCount(0)
    expect(attempts).toBe(failedAttempts + 1)
  })

  test("retries achievements without reloading the profile", async ({ page }) => {
    let attempts = 0
    let recover = false
    await mockUnseen(page)
    await page.route("**/api/v1/users/me/achievements", async (route) => {
      attempts += 1
      if (!recover) {
        await fulfillJson(route, { error: { code: "INTERNAL_ERROR" } }, 500)
        return
      }
      await fulfillJson(route, {
        summary: { unlocked: 1, total: 1 },
        achievements: [achievement(10, { unlocked: true, progress: 100, percent: 100 })],
      })
    })

    await login(page, users.alice)
    await page.goto("/profile")
    const alert = page.getByRole("alert").filter({ hasText: "Не удалось загрузить достижения" })
    await expect(alert).toBeVisible()

    const failedAttempts = attempts
    recover = true
    await alert.getByRole("button", { name: "Повторить" }).click()
    await expect(page.getByText("Ачивка 10", { exact: true })).toBeVisible()
    await expect(alert).toHaveCount(0)
    expect(attempts).toBe(failedAttempts + 1)
  })
})
