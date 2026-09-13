import { expect, test } from "@playwright/test"
import { apiJson, login, password, users } from "./helpers"

type SearchUser = {
  id: string
  name: string
  avatarUrl: string | null
}

async function search(page: Parameters<typeof login>[0], query: string): Promise<SearchUser[]> {
  const response = await apiJson<{ users: SearchUser[] }>(
    page,
    `/api/v1/users/search?q=${encodeURIComponent(query)}`
  )
  return response.users
}

test.describe("user search API", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, users.alice)
  })

  test("requires two trimmed characters and searches names case-insensitively", async ({ page }) => {
    for (const query of ["", " ", "Б", "  Б  "]) {
      expect(await search(page, query)).toEqual([])
    }

    const results = await search(page, "  бОб  ")
    expect(results).toContainEqual(
      expect.objectContaining({ name: users.bob.name, avatarUrl: null })
    )
  })

  test("does not expose the requester, emails or persistence fields", async ({ page }) => {
    expect(await search(page, "Алиса")).toEqual([])
    expect(await search(page, "alice.e2e@example.com")).toEqual([])

    const [bob] = await search(page, "Боб")
    expect(Object.keys(bob).sort()).toEqual(["avatarUrl", "id", "name"])
    expect(bob).not.toHaveProperty("email")
    expect(bob).not.toHaveProperty("passwordHash")
    expect(bob).not.toHaveProperty("payeeAccount")
  })

  test("caps broad search results at ten users", async ({ page }) => {
    for (let index = 0; index < 12; index += 1) {
      const response = await page.request.post("/api/v1/users/register", {
        data: {
          email: `search-cap-${index}@example.com`,
          name: `Searchable E2E ${index.toString().padStart(2, "0")}`,
          password,
        },
      })
      expect(response.status(), await response.text()).toBe(201)
    }

    const results = await search(page, "searchable e2e")
    expect(results).toHaveLength(10)
    expect(new Set(results.map((result) => result.id)).size).toBe(10)
  })

  test("returns deterministic alphabetical results", async ({ page }) => {
    for (const [index, suffix] of ["Zulu", "Alpha", "Mike"].entries()) {
      const response = await page.request.post("/api/v1/users/register", {
        data: {
          email: `search-order-${index}@example.com`,
          name: `Stable Search E2E ${suffix}`,
          password,
        },
      })
      expect(response.status(), await response.text()).toBe(201)
    }

    const names = (await search(page, "Stable Search E2E")).map((result) => result.name)
    expect(names).toEqual([
      "Stable Search E2E Alpha",
      "Stable Search E2E Mike",
      "Stable Search E2E Zulu",
    ])
    expect((await search(page, "Stable Search E2E")).map((result) => result.name)).toEqual(names)
  })

  test("treats punctuation as data and returns controlled JSON", async ({ page }) => {
    for (const query of ["%'_", "\\\\__", "' OR 1=1 --", "🧪🧪"]) {
      const response = await page.request.get(
        `/api/v1/users/search?q=${encodeURIComponent(query)}`
      )
      expect(response.status(), await response.text()).toBe(200)
      expect(await response.json()).toEqual({ users: [] })
    }
  })
})
