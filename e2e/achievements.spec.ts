import { expect, test } from "@playwright/test"
import { apiJson, createGroup, login, users } from "./helpers"

test.describe("achievement persistence and notifications", () => {
  test("GET is side-effect free and unseen unlocks are collected exactly once", async ({ page }) => {
    await page.route("**/api/v1/users/me/achievements/unseen", (route) => route.abort())
    await login(page, users.outsider)
    await createGroup(page, { name: "Achievement E2E" })

    const statistics = await apiJson<{
      statistics: { overview: { activeGroups: number }; groups: { created: number } }
    }>(page, "/api/v1/users/me/statistics")
    expect(statistics.statistics.overview.activeGroups).toBeGreaterThanOrEqual(1)
    expect(statistics.statistics.groups.created).toBeGreaterThanOrEqual(1)

    const first = await apiJson<{
      achievements: Array<{ id: string; unlocked: boolean }>
      summary: { unlocked: number; total: number }
    }>(page, "/api/v1/users/me/achievements")
    const second = await apiJson<typeof first>(page, "/api/v1/users/me/achievements")
    expect(second).toEqual(first)
    expect(first.achievements.find((achievement) => achievement.id === "first-group")?.unlocked)
      .toBe(true)

    const unseenFirst = await apiJson<{ unlocked: Array<{ id: string }> }>(
      page,
      "/api/v1/users/me/achievements/unseen",
      { method: "POST" }
    )
    const unseenSecond = await apiJson<{ unlocked: Array<{ id: string }> }>(
      page,
      "/api/v1/users/me/achievements/unseen",
      { method: "POST" }
    )
    expect(unseenFirst.unlocked.some((achievement) => achievement.id === "first-group")).toBe(true)
    expect(unseenSecond.unlocked).toEqual([])
  })
})
