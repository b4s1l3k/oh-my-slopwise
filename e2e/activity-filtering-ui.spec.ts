import { expect, test } from "@playwright/test"
import { apiJson, createGroup, login, users } from "./helpers"

test.describe("activity filtering UI", () => {
  test("filters several group timelines and restores the complete activity view", async ({ page }) => {
    await login(page, users.alice)
    const firstGroupId = await createGroup(page, { name: "Activity Filter First E2E" })
    const secondGroupId = await createGroup(page, { name: "Activity Filter Second E2E" })
    await apiJson(page, `/api/v1/groups/${firstGroupId}`, {
      method: "PATCH",
      body: { name: "Activity Filter First Renamed E2E" },
    })
    await apiJson(page, `/api/v1/groups/${secondGroupId}`, {
      method: "PATCH",
      body: { name: "Activity Filter Second Renamed E2E" },
    })

    await page.goto("/activity")
    await expect(page.getByRole("heading", { name: "Activity Filter First Renamed E2E" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Activity Filter Second Renamed E2E" })).toBeVisible()

    await page.getByRole("button", { name: "Activity Filter First Renamed E2E" }).click()
    await expect(page.getByRole("heading", { name: "Activity Filter First Renamed E2E" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Activity Filter Second Renamed E2E" })).toHaveCount(0)

    await page.getByRole("button", { name: "Все группы" }).click()
    await expect(page.getByRole("heading", { name: "Activity Filter First Renamed E2E" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Activity Filter Second Renamed E2E" })).toBeVisible()
  })
})
