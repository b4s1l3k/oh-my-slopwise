import { expect, test } from "@playwright/test"
import { login, users } from "./helpers"

test.describe("real HTTP boundaries", () => {
  test("all protected API families reject anonymous requests", async ({ request }) => {
    const cases: Array<{ method: string; path: string; data?: unknown }> = [
      { method: "GET", path: "/api/v1/groups" },
      { method: "GET", path: "/api/v1/groups/unknown/activity" },
      { method: "GET", path: "/api/v1/groups/unknown/balances" },
      { method: "GET", path: "/api/v1/groups/unknown/settlements" },
      { method: "GET", path: "/api/v1/balances/overview" },
      { method: "GET", path: "/api/v1/users/me" },
      { method: "GET", path: "/api/v1/users/me/statistics" },
      { method: "GET", path: "/api/v1/users/me/achievements" },
      { method: "GET", path: "/api/v1/users/search?q=al" },
      { method: "GET", path: "/api/v1/admin/feedback" },
      { method: "GET", path: "/api/v1/invites/unknown" },
      { method: "POST", path: "/api/v1/feedback", data: { message: "anonymous feedback" } },
      { method: "POST", path: "/api/v1/settlements", data: {} },
      { method: "POST", path: "/api/v1/users/me/achievements/unseen" },
      { method: "POST", path: "/api/v1/groups/unknown/invite" },
      { method: "POST", path: "/api/v1/groups/unknown/expenses", data: {} },
      { method: "POST", path: "/api/v1/invites/unknown/accept" },
      { method: "PATCH", path: "/api/v1/users/me", data: { name: "Anonymous" } },
      { method: "PATCH", path: "/api/v1/groups/unknown", data: { name: "Anonymous" } },
      { method: "PATCH", path: "/api/v1/groups/unknown/requisites", data: {} },
      { method: "PATCH", path: "/api/v1/expenses/unknown", data: {} },
      { method: "DELETE", path: "/api/v1/groups/unknown" },
      { method: "DELETE", path: "/api/v1/expenses/unknown" },
    ]

    for (const item of cases) {
      const response = await request.fetch(item.path, {
        method: item.method,
        data: item.data,
      })
      expect(response.status(), item.path).toBe(401)
      expect(await response.json(), item.path).toEqual({ error: "Unauthorized" })
    }
  })

  test("malformed JSON and invalid identifiers return controlled 4xx responses", async ({ page }) => {
    await login(page, users.alice)
    const malformed = await page.request.fetch("/api/v1/groups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      data: "{not-json",
    })
    expect([400, 422]).toContain(malformed.status())

    expect((await page.request.get("/api/v1/groups/not-found")).status()).toBe(404)
    expect((await page.request.get("/api/v1/expenses/not-found")).status()).toBe(404)
    expect((await page.request.get("/api/v1/invites/not-found")).status()).toBe(404)
  })

  test("registration route remains public but validates its input", async ({ request }) => {
    const response = await request.post("/api/v1/users/register", {
      data: { email: "invalid", name: "", password: "short" },
    })
    expect(response.status()).toBe(422)
    const body = await response.json()
    expect(body.error.fieldErrors).toHaveProperty("email")
    expect(body.error.fieldErrors).toHaveProperty("name")
    expect(body.error.fieldErrors).toHaveProperty("password")
  })
})
