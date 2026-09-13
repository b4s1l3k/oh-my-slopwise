import { expect, test } from "@playwright/test"
import { authenticatedContext, login, users } from "./helpers"

test.describe("feedback administration", () => {
  test("admin sees a submitted message and its author", async ({ browser }) => {
    const userContext = await authenticatedContext(browser, users.bob)
    const userPage = userContext.pages()[0]
    const message = `Отзыв для административной проверки ${Date.now()}`
    const submit = await userPage.request.post("/api/v1/feedback", { data: { message } })
    expect(submit.status()).toBe(201)

    const adminContext = await authenticatedContext(browser, users.admin)
    const adminPage = adminContext.pages()[0]
    await adminPage.goto("/admin/feedback")
    await expect(adminPage.getByText(message, { exact: true })).toBeVisible()
    await expect(adminPage.getByText(users.bob.name, { exact: true }).first()).toBeVisible()
    await expect(adminPage.getByText(users.bob.email, { exact: true }).first()).toBeVisible()

    await adminContext.close()
    await userContext.close()
  })

  test("a normal user cannot open or query admin feedback", async ({ page }) => {
    await login(page, users.alice)

    await page.goto("/admin/feedback")
    await expect(page).toHaveURL(/\/dashboard$/)

    const response = await page.request.get("/api/v1/admin/feedback")
    expect(response.status()).toBe(403)
    expect(await response.json()).toEqual({ error: "Forbidden" })
  })
})
