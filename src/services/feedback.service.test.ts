import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import { createFeedback, listFeedback } from "@/services/feedback.service"

// Behavioral SPEC for a future rewrite: assert the ACTUAL behavior of
// feedback.service against the database.

const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === "true"
const describeDatabase = runDatabaseTests ? describe : describe.skip
const testPrefix = `codex-feedback-${Date.now()}`

describeDatabase("feedback.service persistence", () => {
  afterAll(async () => {
    await prisma.feedback.deleteMany({
      where: { user: { email: { startsWith: testPrefix } } },
    })
    await prisma.user.deleteMany({
      where: { email: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
  })

  it("persists a feedback row linked to the user with the given message", async () => {
    const user = await prisma.user.create({
      data: {
        email: `${testPrefix}-author@example.com`,
        name: "Feedback Author",
        passwordHash: "test-only",
      },
    })

    const created = await createFeedback(user.id, "Отличное приложение!")

    expect(created).toMatchObject({
      userId: user.id,
      message: "Отличное приложение!",
    })
    expect(created.id).toBeTruthy()
    expect(created.createdAt).toBeInstanceOf(Date)

    const persisted = await prisma.feedback.findUnique({
      where: { id: created.id },
    })
    expect(persisted).toMatchObject({
      userId: user.id,
      message: "Отличное приложение!",
    })
  })

  it("lists feedback newest-first with the author name and email included", async () => {
    const user = await prisma.user.create({
      data: {
        email: `${testPrefix}-lister@example.com`,
        name: "Feedback Lister",
        passwordHash: "test-only",
      },
    })

    // Insert with explicit, ordered createdAt so we can assert descending order
    // deterministically regardless of insertion speed.
    const older = await prisma.feedback.create({
      data: {
        userId: user.id,
        message: "Первый отзыв",
        createdAt: new Date("2099-01-01T00:00:00.000Z"),
      },
    })
    const newer = await prisma.feedback.create({
      data: {
        userId: user.id,
        message: "Второй отзыв",
        createdAt: new Date("2099-01-02T00:00:00.000Z"),
      },
    })

    const list = await listFeedback()

    const ours = list.filter((item) => item.userId === user.id)
    expect(ours.map((item) => item.id)).toEqual([newer.id, older.id])

    const first = ours.find((item) => item.id === newer.id)
    expect(first).toMatchObject({
      message: "Второй отзыв",
      user: { name: "Feedback Lister", email: `${testPrefix}-lister@example.com` },
    })
    // The include selects only name + email from the related user.
    expect(Object.keys(first!.user).sort()).toEqual(["email", "name"])
  })
})
