import { expect, test, type Page } from "@playwright/test"
import { apiJson, createGroup, login, userId, users } from "./helpers"

async function expectGroupValidation(page: Page, body: unknown): Promise<void> {
  const response = await page.request.post("/api/v1/groups", { data: body })
  expect(response.status(), await response.text()).toBe(422)
  expect(await response.json()).toHaveProperty("error")
}

test.describe("group API validation", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, users.alice)
  })

  test("normalizes text and applies transport defaults", async ({ page }) => {
    const response = await apiJson<{
      group: {
        id: string
        name: string
        description: string | null
        type: string
        currency: string
        members: Array<{ userId: string; role: string }>
      }
    }>(page, "/api/v1/groups", {
      method: "POST",
      expectedStatus: 201,
      body: { name: "  Normalized Group E2E  ", description: "  Details  " },
    })

    expect(response.group).toMatchObject({
      name: "Normalized Group E2E",
      description: "Details",
      type: "OTHER",
      currency: "RUB",
    })
    expect(response.group.members).toHaveLength(1)
    expect(response.group.members[0].role).toBe("ADMIN")
  })

  test("accepts exact text boundaries and deduplicates initial members", async ({ page }) => {
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const bobId = await userId(page, "Боб")
    const group = await apiJson<{
      group: { name: string; description: string | null; members: Array<{ userId: string }> }
    }>(page, "/api/v1/groups", {
      method: "POST",
      expectedStatus: 201,
      body: {
        name: "N".repeat(100),
        description: "D".repeat(500),
        type: "TRIP",
        currency: "USD",
        memberIds: [aliceId, bobId, bobId],
      },
    })

    expect(group.group.name).toHaveLength(100)
    expect(group.group.description).toHaveLength(500)
    expect(group.group.members.map((member) => member.userId).sort()).toEqual(
      [aliceId, bobId].sort()
    )
  })

  test("rejects empty and oversized text without creating a group", async ({ page }) => {
    const before = await apiJson<{ groups: Array<{ id: string }> }>(page, "/api/v1/groups")

    await expectGroupValidation(page, { name: "   " })
    await expectGroupValidation(page, { name: "N".repeat(101) })
    await expectGroupValidation(page, { name: "Valid", description: "D".repeat(501) })

    const after = await apiJson<{ groups: Array<{ id: string }> }>(page, "/api/v1/groups")
    expect(after.groups.map((group) => group.id)).toEqual(before.groups.map((group) => group.id))
  })

  test("rejects invalid enum values and member identifiers while ignoring unknown fields", async ({ page }) => {
    for (const body of [
      { name: "Invalid type", type: "WORK" },
      { name: "Invalid currency", currency: "BTC" },
      { name: "Invalid members", memberIds: [""] },
      { name: "Invalid members", memberIds: "user-id" },
    ]) {
      await expectGroupValidation(page, body)
    }

    const created = await apiJson<{ group: Record<string, unknown> }>(page, "/api/v1/groups", {
      method: "POST",
      expectedStatus: 201,
      body: { name: "Unknown Field E2E", unexpected: true },
    })
    expect(created.group.name).toBe("Unknown Field E2E")
    expect(created.group).not.toHaveProperty("unexpected")
  })

  test("patches normalized text and preserves the last valid value after failures", async ({ page }) => {
    const groupId = await createGroup(page, { name: "Patch Boundaries E2E" })

    const updated = await apiJson<{ group: { name: string; description: string | null } }>(
      page,
      `/api/v1/groups/${groupId}`,
      {
        method: "PATCH",
        body: { name: "  Patched E2E  ", description: "  Patched details  " },
      }
    )
    expect(updated.group).toMatchObject({ name: "Patched E2E", description: "Patched details" })

    for (const body of [
      { name: " " },
      { name: "N".repeat(101) },
      { description: "D".repeat(501) },
    ]) {
      const response = await page.request.patch(`/api/v1/groups/${groupId}`, { data: body })
      expect(response.status(), await response.text()).toBe(422)
    }

    const unchanged = await apiJson<{ group: { name: string; description: string | null } }>(
      page,
      `/api/v1/groups/${groupId}`
    )
    expect(unchanged.group).toMatchObject({ name: "Patched E2E", description: "Patched details" })
  })

  test("validates member mutation shapes and leaves membership unchanged", async ({ page }) => {
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, { name: "Member Validation E2E", memberIds: [bobId] })

    for (const body of [null, {}, { userId: "" }, { userId: 42 }]) {
      const response = await page.request.post(`/api/v1/groups/${groupId}/members`, { data: body })
      expect(response.status(), await response.text()).toBe(422)
    }
    const missingDelete = await page.request.delete(`/api/v1/groups/${groupId}/members`)
    expect(missingDelete.status()).toBe(400)
    expect(await missingDelete.json()).toEqual({ error: "userId required" })

    const group = await apiJson<{ group: { members: Array<{ userId: string }> } }>(
      page,
      `/api/v1/groups/${groupId}`
    )
    expect(group.group.members.filter((member) => member.userId === bobId)).toHaveLength(1)
    expect(group.group.members).toHaveLength(2)
  })
})
