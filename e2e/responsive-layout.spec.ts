import { expect, test } from "@playwright/test"
import { createGroup, login, users } from "./helpers"

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page): Promise<void> {
  await expect.poll(async () => page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
  )).toBe(true)
}

test.describe("responsive layout boundaries", () => {
  test.use({ viewport: { width: 320, height: 568 } })

  test("keeps primary mobile pages within a narrow viewport", async ({ page }) => {
    await login(page, users.alice)

    for (const path of ["/dashboard", "/groups", "/activity", "/profile", "/feedback"]) {
      await page.goto(path)
      await expectNoHorizontalOverflow(page)
      await expect(page.getByRole("navigation", { name: "Мобильная навигация" })).toBeVisible()
    }
  })

  test("marks one current destination in the mobile navigation", async ({ page }) => {
    await login(page, users.alice)
    await page.goto("/profile")

    const navigation = page.getByRole("navigation", { name: "Мобильная навигация" })
    await expect(navigation.getByRole("link", { name: "Профиль" })).toHaveAttribute(
      "aria-current",
      "page"
    )
    await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1)
  })

  test("fits the group creation form and its selectors on a narrow screen", async ({ page }) => {
    await login(page, users.alice)
    await page.goto("/groups/new")

    await expect(page.getByRole("heading", { name: "Новая группа" })).toBeVisible()
    await expect(page.getByLabel("Название *")).toBeVisible()
    await expect(page.getByText("Тип", { exact: true })).toBeVisible()
    await expect(page.getByText("Валюта расчёта", { exact: true })).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })

  test("keeps an expense dialog inside the mobile viewport", async ({ page }) => {
    await login(page, users.alice)
    const groupId = await createGroup(page, { name: "Mobile Expense Dialog E2E" })
    await page.goto(`/groups/${groupId}`)
    await page.getByRole("button", { name: "Расход", exact: true }).click()

    const dialog = page.getByRole("dialog", { name: "Новый расход" })
    await expect(dialog).toBeVisible()
    const box = await dialog.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(320)
    await expectNoHorizontalOverflow(page)
  })
})
