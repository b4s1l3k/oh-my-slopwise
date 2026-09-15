import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { expect, test, type Page, type Route } from "@playwright/test"
import { e2eDatabaseUrl } from "../playwright.config"
import { apiJson, login, users } from "./helpers"

const GROUP_PAGE_SIZE = 30

type ListedGroup = {
  id: string
  name: string
  updatedAt: string
}

type GroupPage = {
  groups: ListedGroup[]
  nextCursor: string | null
}

test.describe("group cursor pagination", () => {
  test.skip(
    process.env.E2E_EXTERNAL_SERVER === "true",
    "same-timestamp setup requires the guarded local legacy E2E database"
  )

  test("keeps same-timestamp API and UI pages stable without duplicates", async ({ page }) => {
    test.setTimeout(90_000)
    await login(page, users.alice)
    const seeded = await seedSameTimestampGroups("Stable group page")
    const expectedIds = seeded.map((group) => group.id)

    const first = await apiJson<GroupPage>(page, "/api/v1/groups")
    expect(first.groups).toHaveLength(GROUP_PAGE_SIZE)
    expect(first.groups.map((group) => group.id)).toEqual(expectedIds.slice(0, GROUP_PAGE_SIZE))
    expect(first.nextCursor).toEqual(expect.any(String))

    const second = await apiJson<GroupPage>(
      page,
      `/api/v1/groups?cursor=${encodeURIComponent(first.nextCursor!)}`
    )
    const combined = [...first.groups, ...second.groups]
    expect(second.groups[0].id).toBe(expectedIds[GROUP_PAGE_SIZE])
    expect(new Set(combined.map((group) => group.id)).size).toBe(combined.length)
    expect(combined.filter((group) => expectedIds.includes(group.id))).toHaveLength(
      GROUP_PAGE_SIZE + 1
    )
    expect(new Set(
      combined
        .filter((group) => expectedIds.includes(group.id))
        .map((group) => group.updatedAt)
    ).size).toBe(1)

    await page.goto("/groups")
    await expect(seededGroupHeadings(page, "Stable group page")).toHaveCount(30)
    await expect(page.getByText(seeded[GROUP_PAGE_SIZE].name, { exact: true })).toHaveCount(0)

    await page.getByRole("button", { name: "Показать ещё" }).click()
    await expect(page.getByText(seeded[GROUP_PAGE_SIZE].name, { exact: true })).toBeVisible()
    await expect(seededGroupHeadings(page, "Stable group page")).toHaveCount(31)
    for (const group of seeded) {
      await expect(page.getByText(group.name, { exact: true })).toHaveCount(1)
    }
  })

  test("keeps the first group page visible and retries a failed next page", async ({ page }) => {
    test.setTimeout(90_000)
    await login(page, users.alice)
    const seeded = await seedSameTimestampGroups("Recovery group page")
    const prefix = "Recovery group page"
    let pageTwoAttempts = 0

    await page.route("**/api/v1/groups**", async (route) => {
      const url = new URL(route.request().url())
      if (
        route.request().method() !== "GET" ||
        url.pathname !== "/api/v1/groups" ||
        url.searchParams.get("cursor") == null
      ) {
        await route.continue()
        return
      }
      pageTwoAttempts += 1
      // QueryClient retries a failed query once before exposing next-page state.
      if (pageTwoAttempts <= 2) {
        await failJson(route)
        return
      }
      await route.continue()
    })

    await page.goto("/groups")
    await expect(seededGroupHeadings(page, prefix)).toHaveCount(30)
    await page.getByRole("button", { name: "Показать ещё" }).click()
    await expect(page.getByText("Не удалось загрузить группы. Попробуйте ещё раз.")).toBeVisible()
    await expect(seededGroupHeadings(page, prefix)).toHaveCount(30)

    await page.getByRole("button", { name: "Показать ещё" }).click()
    await expect(page.getByText(seeded[GROUP_PAGE_SIZE].name, { exact: true })).toBeVisible()
    await expect(page.getByText("Не удалось загрузить группы. Попробуйте ещё раз.")).toHaveCount(0)
    await expect(seededGroupHeadings(page, prefix)).toHaveCount(31)
    expect(pageTwoAttempts).toBe(3)
  })
})

function seededGroupHeadings(page: Page, prefix: string) {
  return page.locator("h3").filter({ hasText: prefix })
}

async function failJson(route: Route): Promise<void> {
  await route.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "INTERNAL_ERROR" } }),
  })
}

async function seedSameTimestampGroups(namePrefix: string): Promise<ListedGroup[]> {
  if (!/[_-]e2e(?:\?|$)/.test(e2eDatabaseUrl)) {
    throw new Error("Refusing to seed groups outside the local E2E database")
  }
  const prisma = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } })
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: users.alice.email } })
    const runId = randomUUID()
    const groups = Array.from({ length: GROUP_PAGE_SIZE + 1 }, (_, index) => ({
      id: `group-page-${runId}-${String(index).padStart(2, "0")}`,
      name: `${namePrefix} ${runId} ${String(index).padStart(2, "0")}`,
    }))

    await prisma.$transaction(async (tx) => {
      await tx.group.createMany({
        data: groups.map((group) => ({
          ...group,
          type: "OTHER",
          currency: "RUB",
          createdById: user.id,
        })),
      })
      await tx.groupMember.createMany({
        data: groups.map((group) => ({
          id: `membership-${group.id}`,
          groupId: group.id,
          userId: user.id,
          role: "ADMIN",
        })),
      })
      // One SQL statement gives every row the same transaction timestamp via
      // groups_set_updatedAt, forcing the id tie-break across the page boundary.
      await tx.group.updateMany({
        where: { id: { in: groups.map((group) => group.id) } },
        data: { description: "same-timestamp pagination fixture" },
      })
    })

    const persisted = await prisma.group.findMany({
      where: { id: { in: groups.map((group) => group.id) } },
      select: { id: true, name: true, updatedAt: true },
      orderBy: { id: "desc" },
    })
    if (new Set(persisted.map((group) => group.updatedAt.getTime())).size !== 1) {
      throw new Error("Expected the pagination fixture to share one updatedAt")
    }
    return persisted.map((group) => ({
      id: group.id,
      name: group.name,
      updatedAt: group.updatedAt.toISOString(),
    }))
  } finally {
    await prisma.$disconnect()
  }
}
