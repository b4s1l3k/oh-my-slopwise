import { expect, test } from "@playwright/test"
import {
  apiJson,
  authenticatedContext,
  createExpense,
  createGroup,
  login,
  userId,
  users,
} from "./helpers"

test.describe("expense permissions and pagination", () => {
  test("member cannot edit another member expense or reset settlements", async ({ browser }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const aliceId = (await apiJson<{ user: { id: string } }>(alicePage, "/api/v1/users/me")).user.id
    const bobId = await userId(alicePage, "Боб")
    const carolId = await userId(alicePage, "Карина")
    const groupId = await createGroup(alicePage, {
      name: "Expense Permissions E2E",
      memberIds: [bobId, carolId],
    })
    const expense = await createExpense(alicePage, groupId, {
      ...expenseCommand("Protected E2E", aliceId, [aliceId, bobId]),
    })

    const carolContext = await authenticatedContext(browser, users.carol)
    const carolPage = carolContext.pages()[0]
    const patch = await carolPage.request.patch(`/api/v1/expenses/${expense.id}`, {
      data: expenseCommand("Forbidden", aliceId, [aliceId, bobId]),
    })
    expect(patch.status()).toBe(403)
    expect((await carolPage.request.delete(`/api/v1/expenses/${expense.id}`)).status()).toBe(403)
    expect((await carolPage.request.delete(`/api/v1/groups/${groupId}/settlements`)).status()).toBe(403)

    await carolContext.close()
    await aliceContext.close()
  })

  test("payer may edit an expense created by somebody else but may not delete it", async ({ browser }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const aliceId = (await apiJson<{ user: { id: string } }>(alicePage, "/api/v1/users/me")).user.id
    const bobId = await userId(alicePage, "Боб")
    const groupId = await createGroup(alicePage, {
      name: "Expense Payer Permissions E2E",
      memberIds: [bobId],
    })
    const expense = await createExpense(
      alicePage,
      groupId,
      expenseCommand("Created by Alice", bobId, [aliceId, bobId])
    )

    const bobContext = await authenticatedContext(browser, users.bob)
    const bobPage = bobContext.pages()[0]
    const update = await bobPage.request.patch(`/api/v1/expenses/${expense.id}`, {
      data: expenseCommand("Edited by payer", bobId, [aliceId, bobId]),
    })
    expect(update.status(), await update.text()).toBe(200)
    await expect(update.json()).resolves.toMatchObject({ expense: { title: "Edited by payer" } })
    expect((await bobPage.request.delete(`/api/v1/expenses/${expense.id}`)).status()).toBe(403)

    await bobContext.close()
    await aliceContext.close()
  })

  test("outsider cannot discover or mutate an expense", async ({ browser }) => {
    const aliceContext = await authenticatedContext(browser, users.alice)
    const alicePage = aliceContext.pages()[0]
    const aliceId = (await apiJson<{ user: { id: string } }>(alicePage, "/api/v1/users/me")).user.id
    const groupId = await createGroup(alicePage, { name: "Expense Outsider E2E" })
    const expense = await createExpense(
      alicePage,
      groupId,
      expenseCommand("Private expense", aliceId, [aliceId])
    )

    const outsiderContext = await authenticatedContext(browser, users.outsider)
    const outsiderPage = outsiderContext.pages()[0]
    expect((await outsiderPage.request.get(`/api/v1/expenses/${expense.id}`)).status()).toBe(404)
    expect((await outsiderPage.request.patch(`/api/v1/expenses/${expense.id}`, {
      data: expenseCommand("Mutated", aliceId, [aliceId]),
    })).status()).toBe(403)
    expect((await outsiderPage.request.delete(`/api/v1/expenses/${expense.id}`)).status()).toBe(403)
    expect((await outsiderPage.request.get(`/api/v1/groups/${groupId}/expenses`)).status()).toBe(403)

    await outsiderContext.close()
    await aliceContext.close()
  })

  test("returns not found consistently for unknown expense IDs", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const command = expenseCommand("Missing", aliceId, [aliceId])

    expect((await page.request.get("/api/v1/expenses/no-such-expense")).status()).toBe(404)
    expect((await page.request.patch("/api/v1/expenses/no-such-expense", {
      data: command,
    })).status()).toBe(404)
    expect((await page.request.delete("/api/v1/expenses/no-such-expense")).status()).toBe(404)
  })

  test("paginates expenses in stable pages of thirty", async ({ page }) => {
    test.setTimeout(90_000)
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const groupId = await createGroup(page, { name: "Expense Pagination E2E" })

    for (let index = 1; index <= 31; index += 1) {
      await createExpense(page, groupId, {
        ...expenseCommand(`Paginated ${index}`, aliceId, [aliceId]),
        amount: index,
      })
    }

    const first = await apiJson<{
      expenses: Array<{ title: string }>
      nextCursor: string | null
    }>(page, `/api/v1/groups/${groupId}/expenses`)
    expect(first.nextCursor).toEqual(expect.any(String))
    const second = await apiJson<{
      expenses: Array<{ title: string }>
      nextCursor: string | null
    }>(page, `/api/v1/groups/${groupId}/expenses?cursor=${encodeURIComponent(first.nextCursor!)}`)
    expect(first.expenses).toHaveLength(30)
    expect(second.nextCursor).toBeNull()
    expect(second.expenses).toHaveLength(1)
    expect(new Set([...first.expenses, ...second.expenses].map((expense) => expense.title)).size).toBe(31)
  })
})

function expenseCommand(title: string, paidById: string, participantIds: string[]) {
  return {
    title,
    amount: 1_000,
    currency: "RUB",
    date: "2026-09-13",
    paidById,
    splitType: "EQUAL",
    splits: participantIds.map((userId) => ({ userId })),
  }
}
