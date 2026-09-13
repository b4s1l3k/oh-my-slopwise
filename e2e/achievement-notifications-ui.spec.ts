import { expect, test, type Route } from "@playwright/test"
import { login, users } from "./helpers"

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
}

test.describe("achievement notifications UI", () => {
  test("shows an unseen achievement once and lets the user dismiss it", async ({ page }) => {
    let requests = 0
    await page.route("**/api/v1/users/me/achievements/unseen", async (route) => {
      requests += 1
      await fulfillJson(route, {
        unlocked: requests === 1
          ? [{
              id: "ui-first-group",
              title: "Первая UI-группа",
              description: "Создана первая группа",
              icon: "trophy",
            }]
          : [],
      })
    })

    await login(page, users.alice)
    const notification = page.getByRole("status").filter({ hasText: "Первая UI-группа" })
    await expect(notification).toBeVisible()
    await expect(notification.getByText("Достижение получено", { exact: true })).toBeVisible()
    await expect(page.getByText("Первая UI-группа", { exact: true })).toHaveCount(1)

    await notification.getByRole("button", { name: "Закрыть" }).focus()
    await page.keyboard.press("Enter")
    await expect(notification).toHaveCount(0)
  })

  test("staggers several achievement notifications instead of losing them", async ({ page }) => {
    const titles = ["UI-достижение один", "UI-достижение два"]
    await page.addInitScript((expectedTitles) => {
      const target = window as typeof window & {
        __e2eAchievementToastEvents?: Array<{ title: string; at: number }>
      }
      const events: Array<{ title: string; at: number }> = []
      const seen = new Set<string>()
      target.__e2eAchievementToastEvents = events
      new MutationObserver(() => {
        const statuses = [...document.querySelectorAll<HTMLElement>('[role="status"]')]
        for (const title of expectedTitles) {
          if (!seen.has(title) && statuses.some((status) => status.textContent?.includes(title))) {
            seen.add(title)
            events.push({ title, at: performance.now() })
          }
        }
      }).observe(document, { childList: true, subtree: true })
    }, titles)

    await page.route("**/api/v1/users/me/achievements/unseen", (route) =>
      fulfillJson(route, {
        unlocked: [
          {
            id: "ui-achievement-one",
            title: "UI-достижение один",
            description: "Первое описание",
            icon: "trophy",
          },
          {
            id: "ui-achievement-two",
            title: "UI-достижение два",
            description: "Второе описание",
            icon: "trophy",
          },
        ],
      })
    )

    await login(page, users.alice)
    const first = page.getByText(titles[0], { exact: true })
    const second = page.getByText(titles[1], { exact: true })
    await expect(first).toBeVisible()
    await expect(second).toHaveCount(0)
    await expect(second).toBeVisible()
    await expect(page.getByText("Достижение получено", { exact: true })).toHaveCount(2)

    const events = await page.evaluate(() =>
      (window as typeof window & {
        __e2eAchievementToastEvents?: Array<{ title: string; at: number }>
      }).__e2eAchievementToastEvents ?? []
    )
    expect(events.map((event) => event.title)).toEqual(titles)
    expect(events[1].at - events[0].at).toBeGreaterThanOrEqual(700)
  })

  test("silently ignores a failed notification poll", async ({ page }) => {
    await page.route("**/api/v1/users/me/achievements/unseen", (route) =>
      fulfillJson(route, { error: { code: "INTERNAL_ERROR" } }, 500)
    )

    await login(page, users.alice)
    await expect(page.getByRole("heading", { name: /Привет, Алиса/ })).toBeVisible()
    await expect(page.getByText("Достижение получено", { exact: true })).toHaveCount(0)
  })
})
