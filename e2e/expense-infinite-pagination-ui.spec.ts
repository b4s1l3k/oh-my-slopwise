import { expect, test } from "@playwright/test"
import { apiJson, createExpense, createGroup, login, users } from "./helpers"

test.describe("expense infinite pagination UI", () => {
  test("loads the second page through Show more without duplicates and then removes the control", async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const groupId = await createGroup(page, { name: "Expense UI Pagination E2E" })

    for (let index = 1; index <= 31; index += 1) {
      await createExpense(page, groupId, {
        title: `UI page expense ${String(index).padStart(2, "0")}`,
        amount: index,
        currency: "RUB",
        date: "2026-09-13",
        paidById: aliceId,
        splitType: "EQUAL",
        splits: [{ userId: aliceId }],
      })
    }

    await page.goto(`/groups/${groupId}`)
    await expect(page.getByRole("heading", { name: "Расходы (30 из 31)" })).toBeVisible()
    await expect(page.getByText("UI page expense 31", { exact: true })).toBeVisible()
    await expect(page.getByText("UI page expense 01", { exact: true })).toHaveCount(0)

    const loadMore = page.getByRole("button", { name: "Показать ещё" })
    await loadMore.click()

    await expect(page.getByRole("heading", { name: "Расходы (31)" })).toBeVisible()
    await expect(page.getByText("UI page expense 01", { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Показать ещё" })).toHaveCount(0)
    await expect(page.getByText(/^UI page expense \d{2}$/)).toHaveCount(31)
  })

  test("keeps loaded expenses visible after a failed next page and succeeds on retry", async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const groupId = await createGroup(page, { name: "Expense UI Page Recovery E2E" })

    for (let index = 1; index <= 31; index += 1) {
      await createExpense(page, groupId, {
        title: `Recovery expense ${String(index).padStart(2, "0")}`,
        amount: index,
        currency: "RUB",
        date: "2026-09-13",
        paidById: aliceId,
        splitType: "EQUAL",
        splits: [{ userId: aliceId }],
      })
    }

    let pageTwoAttempts = 0
    await page.route(`**/api/v1/groups/${groupId}/expenses**`, async (route) => {
      const url = new URL(route.request().url())
      if (url.searchParams.get("page") !== "2") {
        await route.continue()
        return
      }
      pageTwoAttempts += 1
      // QueryClient retries a failed query once before surfacing the error.
      if (pageTwoAttempts <= 2) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "INTERNAL_ERROR" } }),
        })
        return
      }
      await route.continue()
    })

    await page.goto(`/groups/${groupId}`)
    await page.getByRole("button", { name: "Показать ещё" }).click()
    await expect(page.getByText("Не удалось загрузить расходы. Попробуйте ещё раз.")).toBeVisible()
    await expect(page.getByText("Recovery expense 31", { exact: true })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Расходы (30 из 31)" })).toBeVisible()

    await page.getByRole("button", { name: "Показать ещё" }).click()
    await expect(page.getByText("Recovery expense 01", { exact: true })).toBeVisible()
    await expect(page.getByText("Не удалось загрузить расходы. Попробуйте ещё раз.")).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "Расходы (31)" })).toBeVisible()
    expect(pageTwoAttempts).toBe(3)
  })
})
