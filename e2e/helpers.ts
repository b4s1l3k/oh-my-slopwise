import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test"

export const users = {
  admin: { email: "admin.e2e@example.com", name: "Админ E2E" },
  alice: { email: "alice.e2e@example.com", name: "Алиса E2E" },
  bob: { email: "bob.e2e@example.com", name: "Боб E2E" },
  carol: { email: "carol.e2e@example.com", name: "Карина E2E" },
  outsider: { email: "outsider.e2e@example.com", name: "Внешний E2E" },
} as const

export const password = "E2e-password-123"

export async function login(
  page: Page,
  user: { email: string },
  userPassword = password
): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill(user.email)
  await page.getByLabel("Пароль").fill(userPassword)
  await page.getByRole("button", { name: "Войти" }).click()
  await expect(page).toHaveURL(/\/(?:dashboard)?$/)
}

export async function authenticatedContext(
  browser: Browser,
  user: { email: string }
): Promise<BrowserContext> {
  const context = await browser.newContext({
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
  })
  await login(await context.newPage(), user)
  return context
}

export async function apiJson<T>(
  page: Page,
  path: string,
  options?: { method?: string; body?: unknown; expectedStatus?: number }
): Promise<T> {
  const response = await page.request.fetch(path, {
    method: options?.method,
    data: options?.body,
  })
  expect(response.status(), await response.text()).toBe(options?.expectedStatus ?? 200)
  return response.json() as Promise<T>
}

export async function createGroup(
  page: Page,
  input: {
    name: string
    memberIds?: string[]
    currency?: string
    type?: "HOME" | "TRIP" | "COUPLE" | "OTHER"
  }
): Promise<string> {
  const response = await apiJson<{ group: { id: string } }>(page, "/api/v1/groups", {
    method: "POST",
    expectedStatus: 201,
    body: {
      name: input.name,
      memberIds: input.memberIds ?? [],
      currency: input.currency ?? "RUB",
      type: input.type ?? "OTHER",
    },
  })
  return response.group.id
}

export async function userId(page: Page, query: string): Promise<string> {
  const response = await apiJson<{ users: Array<{ id: string; name: string }> }>(
    page,
    `/api/v1/users/search?q=${encodeURIComponent(query)}`
  )
  const user = response.users.find((candidate) => candidate.name.includes(query))
  if (!user) throw new Error(`User not found: ${query}`)
  return user.id
}

export function collectRuntimeErrors(page: Page): string[] {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`))
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location()
      const source = location.url
        ? ` (${location.url}:${location.lineNumber}:${location.columnNumber})`
        : ""
      errors.push(`console: ${message.text()}${source}`)
    }
  })
  return errors
}

export async function expectNoRuntimeErrorsAfterSettling(
  page: Page,
  errors: string[]
): Promise<void> {
  // Rendering assertions can complete before errors from deferred effects and
  // rejected browser promises reach Playwright. Keep the listeners alive for
  // a short quiet window before declaring the page healthy.
  await page.waitForTimeout(500)
  expect(errors).toEqual([])
}

export async function createExpense(
  page: Page,
  groupId: string,
  body: Record<string, unknown>
): Promise<ExpenseFixtureResponse> {
  const response = await apiJson<{ expense: ExpenseFixtureResponse }>(
    page,
    `/api/v1/groups/${groupId}/expenses`,
    { method: "POST", expectedStatus: 201, body }
  )
  return response.expense
}

export type ExpenseFixtureResponse = {
  id: string
  title: string
  amount: number
  amountBase: number | null
  currency: string
  customRate: number | null
  paidById: string
  createdById: string
  splitType: "EQUAL" | "EXACT" | "PERCENTAGE"
  date: string
  splits: Array<{
    userId: string
    amount: number
    amountBase: number | null
    percentage: number | null
  }>
  settlements: Array<{
    id: string
    amount: number
    currency: string
    amountBase: number | null
  }>
}
