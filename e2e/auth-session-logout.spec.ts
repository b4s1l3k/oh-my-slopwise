import { expect, test } from "@playwright/test"
import { login, users } from "./helpers"

test.describe("authentication session lifecycle", () => {
  test("logout invalidates API access and prevents browser back from revealing the profile", async ({ page }) => {
    await login(page, users.alice)
    await page.goto("/profile")
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue(users.alice.email)

    await page.getByRole("button", { name: "Выйти из аккаунта" }).click()
    await expect(page).toHaveURL(/\/login(?:\?|$)/)

    const profileResponse = await page.request.get("/api/v1/users/me")
    expect(profileResponse.status()).toBe(401)
    expect(await profileResponse.json()).toEqual({ error: "Unauthorized" })

    await page.goBack()
    await expect(page).toHaveURL(/\/login(?:\?|$)/)
    await expect(page.getByLabel("Email")).toBeVisible()
    await expect(page.getByText(users.alice.email, { exact: true })).toHaveCount(0)
  })

  test("a forged session cookie is rejected by both pages and API", async ({ page }) => {
    await login(page, users.bob)
    const sessionCookies = (await page.context().cookies()).filter((cookie) =>
      cookie.name.includes("authjs.session-token")
    )
    expect(sessionCookies.length).toBeGreaterThan(0)

    await page.context().addCookies(sessionCookies.map((cookie) => ({
      ...cookie,
      value: `${cookie.value.slice(0, -1)}${cookie.value.endsWith("a") ? "b" : "a"}`,
    })))

    const response = await page.request.get("/api/v1/users/me")
    expect(response.status()).toBe(401)

    await page.goto("/profile")
    await expect(page).toHaveURL(/\/login(?:\?|$)/)
  })
})
