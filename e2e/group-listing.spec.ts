import { expect, test } from "@playwright/test"
import { apiJson, createExpense, createGroup, login, userId, users } from "./helpers"

type ListedGroup = {
  id: string
  name: string
  updatedAt: string
  _count?: { expenses: number }
  members: Array<{
    userId: string
    payeeName: string | null
    bankName: string | null
    payeeAccount: string | null
    user: Record<string, unknown>
  }>
}

test.describe("group list API", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, users.alice)
  })

  test("reports the persisted expense count and moves recently changed groups first", async ({
    page,
  }) => {
    const aliceId = (await apiJson<{ user: { id: string } }>(page, "/api/v1/users/me")).user.id
    const olderId = await createGroup(page, { name: "Group Ordering Older E2E" })
    const newerId = await createGroup(page, { name: "Group Ordering Newer E2E" })

    await createExpense(page, olderId, {
      title: "Updates ordering",
      amount: 100,
      currency: "RUB",
      date: "2026-09-13",
      paidById: aliceId,
      splitType: "EQUAL",
      splits: [{ userId: aliceId }],
    })

    const { groups } = await apiJson<{ groups: ListedGroup[] }>(page, "/api/v1/groups")
    const olderIndex = groups.findIndex((group) => group.id === olderId)
    const newerIndex = groups.findIndex((group) => group.id === newerId)
    expect(olderIndex).toBeGreaterThanOrEqual(0)
    expect(newerIndex).toBeGreaterThanOrEqual(0)
    expect(olderIndex).toBeLessThan(newerIndex)
    expect(groups[olderIndex]._count).toEqual({ expenses: 1 })
    expect(groups[newerIndex]._count).toEqual({ expenses: 0 })
    expect(Date.parse(groups[olderIndex].updatedAt)).toBeGreaterThanOrEqual(
      Date.parse(groups[newerIndex].updatedAt)
    )
  })

  test("does not serialize payment requisites in collection responses", async ({ page }) => {
    const bobId = await userId(page, "Боб")
    const groupId = await createGroup(page, {
      name: "List Privacy E2E",
      memberIds: [bobId],
    })

    const { groups } = await apiJson<{ groups: ListedGroup[] }>(page, "/api/v1/groups")
    const listed = groups.find((group) => group.id === groupId)
    expect(listed).toBeDefined()
    expect(JSON.stringify(listed)).not.toContain("Альфа Тест")
    expect(JSON.stringify(listed)).not.toContain("Бета Тест")
    for (const member of listed!.members) {
      expect(member).toMatchObject({ payeeName: null, bankName: null, payeeAccount: null })
      expect(member.user).not.toHaveProperty("payeeName")
      expect(member.user).not.toHaveProperty("bankName")
      expect(member.user).not.toHaveProperty("payeeAccount")
    }
  })
})
