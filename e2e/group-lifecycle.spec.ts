import { expect, test } from "@playwright/test"
import { apiJson, createGroup, login, userId, users } from "./helpers"

test.describe("group lifecycle", () => {
  test("lists a created group and deletes a debt-free group", async ({ page }) => {
    await login(page, users.alice)
    const groupId = await createGroup(page, { name: "Delete Empty E2E", type: "HOME" })

    await page.goto("/groups")
    await expect(page.getByText("Delete Empty E2E")).toBeVisible()
    await page.goto(`/groups/${groupId}/settings`)
    page.once("dialog", (dialog) => dialog.accept())
    await page.getByRole("button", { name: "Удалить группу" }).click()
    await expect(page).toHaveURL(/\/groups$/)
    await expect(page.getByText("Delete Empty E2E")).toHaveCount(0)
  })

  test("does not delete a group while debts remain", async ({ page }) => {
    await login(page, users.alice)
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, { name: "Debt Delete E2E", memberIds: [bobId] })
    await apiJson(page, `/api/v1/groups/${groupId}/expenses`, {
      method: "POST",
      expectedStatus: 201,
      body: {
        title: "Debt",
        amount: 1_000,
        currency: "RUB",
        date: "2026-09-13",
        paidById: aliceId,
        splitType: "EQUAL",
        splits: [{ userId: aliceId }, { userId: bobId }],
      },
    })

    const response = await page.request.delete(`/api/v1/groups/${groupId}`)
    expect(response.status()).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: "GROUP_HAS_BALANCES" } })
    expect((await page.request.get(`/api/v1/groups/${groupId}`)).status()).toBe(200)
  })

  test("rejects duplicate active membership and unknown users", async ({ page }) => {
    await login(page, users.alice)
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, { name: "Membership Errors E2E", memberIds: [bobId] })

    const duplicate = await page.request.post(`/api/v1/groups/${groupId}/members`, {
      data: { userId: bobId },
    })
    expect(duplicate.status()).toBe(409)
    expect(await duplicate.json()).toMatchObject({ error: { code: "MEMBER_ALREADY_ACTIVE" } })

    const unknown = await page.request.post(`/api/v1/groups/${groupId}/members`, {
      data: { userId: "missing-user" },
    })
    expect(unknown.status()).toBe(404)
  })
})
