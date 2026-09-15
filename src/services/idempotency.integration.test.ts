import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db"
import { createExpense } from "@/services/expenses.service"
import { createFeedback } from "@/services/feedback.service"
import { createGroup } from "@/services/groups.service"
import { createSettlement } from "@/services/settlements.service"

const runDatabaseTests = process.env.RUN_DB_INTEGRATION_TESTS === "true"
const describeDatabase = runDatabaseTests ? describe : describe.skip
const testPrefix = `idempotency-${Date.now()}`
const operationDate = "2028-03-15"

let sequence = 0

async function createUser(name: string) {
  sequence += 1
  return prisma.user.create({
    data: {
      email: `${testPrefix}-${sequence}@example.test`,
      name,
      passwordHash: "test-only",
    },
  })
}

describeDatabase("idempotent create commands", () => {
  afterAll(async () => {
    await prisma.feedback.deleteMany({
      where: { user: { email: { startsWith: testPrefix } } },
    })
    await prisma.group.deleteMany({
      where: { createdBy: { email: { startsWith: testPrefix } } },
    })
    await prisma.user.deleteMany({
      where: { email: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
  })

  it("returns the original group and rejects a changed payload for the same key", async () => {
    const user = await createUser("Group owner")
    const command = {
      name: "Idempotent group",
      type: "OTHER" as const,
      currency: "RUB" as const,
      memberIds: [],
    }

    const first = await createGroup(user.id, command, "group-command-0001")
    const replay = await createGroup(user.id, command, "group-command-0001")

    expect(replay.id).toBe(first.id)
    expect(await prisma.group.count({ where: { createdById: user.id } })).toBe(1)
    await expect(createGroup(
      user.id,
      { ...command, name: "Different group" },
      "group-command-0001"
    )).rejects.toThrow("IDEMPOTENCY_KEY_REUSED")
  })

  it("deduplicates concurrent group creation before either request has a record", async () => {
    const user = await createUser("Concurrent group owner")
    const command = {
      name: "Concurrent group",
      type: "OTHER" as const,
      currency: "RUB" as const,
      memberIds: [],
    }

    const [first, replay] = await Promise.all([
      createGroup(user.id, command, "group-command-concurrent-0001"),
      createGroup(user.id, command, "group-command-concurrent-0001"),
    ])

    expect(replay.id).toBe(first.id)
    await expect(Promise.all([
      prisma.group.count({ where: { createdById: user.id } }),
      prisma.idempotencyRecord.count({ where: { principalId: user.id } }),
    ])).resolves.toEqual([1, 1])
  })

  it("deduplicates an expense together with its activity and history facts", async () => {
    const [owner, member] = await Promise.all([
      createUser("Expense owner"),
      createUser("Expense member"),
    ])
    const group = await createGroup(owner.id, {
      name: "Expense group",
      type: "OTHER",
      currency: "RUB" as const,
      memberIds: [member.id],
    })
    const command = {
      title: "Dinner",
      amount: 10_000,
      currency: "RUB" as const,
      date: operationDate,
      paidById: owner.id,
      splitType: "EQUAL" as const,
      splits: [{ userId: owner.id }, { userId: member.id }],
    }

    const first = await createExpense(group.id, owner.id, command, "expense-command-0001")
    const replay = await createExpense(group.id, owner.id, command, "expense-command-0001")

    expect(replay.id).toBe(first.id)
    await expect(Promise.all([
      prisma.expense.count({ where: { groupId: group.id } }),
      prisma.activityLog.count({ where: { entityType: "expense", entityId: first.id } }),
      prisma.userStatisticFact.count({ where: { reference: first.id, kind: "EXPENSE_CREATED" } }),
    ])).resolves.toEqual([1, 1, 1])
  })

  it("deduplicates concurrent settlements and every transactional side effect", async () => {
    const [debtor, creditor] = await Promise.all([
      createUser("Settlement debtor"),
      createUser("Settlement creditor"),
    ])
    const group = await createGroup(debtor.id, {
      name: "Settlement group",
      type: "OTHER",
      currency: "RUB",
      memberIds: [creditor.id],
    })
    await createExpense(group.id, debtor.id, {
      title: "Debt source",
      amount: 25_000,
      currency: "RUB",
      date: operationDate,
      paidById: creditor.id,
      splitType: "EXACT",
      splits: [{ userId: debtor.id, amount: 25_000 }],
    })
    const command = {
      groupId: group.id,
      toUserId: creditor.id,
      amount: 25_000,
      currency: "RUB" as const,
      date: operationDate,
    }

    const [first, replay] = await Promise.all([
      createSettlement(debtor.id, command, "settlement-command-0001"),
      createSettlement(debtor.id, command, "settlement-command-0001"),
    ])

    expect(replay.id).toBe(first.id)
    await expect(Promise.all([
      prisma.settlement.count({ where: { groupId: group.id, expenseId: null } }),
      prisma.activityLog.count({ where: { entityType: "settlement", entityId: first.id } }),
      prisma.userStatisticFact.count({ where: { reference: first.id } }),
    ])).resolves.toEqual([1, 1, 3])
  })

  it("deduplicates feedback and allows reuse after expiry", async () => {
    const user = await createUser("Feedback author")
    const first = await createFeedback(user.id, "First feedback", "feedback-command-0001")
    const replay = await createFeedback(user.id, "First feedback", "feedback-command-0001")
    expect(replay.id).toBe(first.id)

    await prisma.idempotencyRecord.update({
      where: {
        principalId_operation_key: {
          principalId: user.id,
          operation: "CREATE_FEEDBACK",
          key: "feedback-command-0001",
        },
      },
      data: { expiresAt: new Date(0) },
    })
    const afterExpiry = await createFeedback(
      user.id,
      "Feedback after expiry",
      "feedback-command-0001"
    )

    expect(afterExpiry.id).not.toBe(first.id)
    expect(await prisma.feedback.count({ where: { userId: user.id } })).toBe(2)
    expect(await prisma.idempotencyRecord.count({ where: { principalId: user.id } })).toBe(1)
  })

  it("rolls back the losing resource on a concurrent unique-key conflict", async () => {
    const user = await createUser("Concurrent feedback author")

    const [first, replay] = await Promise.all([
      createFeedback(user.id, "Concurrent feedback", "feedback-command-concurrent-0001"),
      createFeedback(user.id, "Concurrent feedback", "feedback-command-concurrent-0001"),
    ])

    expect(replay.id).toBe(first.id)
    await expect(Promise.all([
      prisma.feedback.count({ where: { userId: user.id } }),
      prisma.idempotencyRecord.count({ where: { principalId: user.id } }),
    ])).resolves.toEqual([1, 1])
  })

  it("does not recreate a resource when the recorded result was deleted", async () => {
    const user = await createUser("Deleted feedback author")
    const feedback = await createFeedback(
      user.id,
      "Feedback that will be deleted",
      "feedback-command-deleted-0001"
    )
    await prisma.feedback.delete({ where: { id: feedback.id } })

    await expect(createFeedback(
      user.id,
      "Feedback that will be deleted",
      "feedback-command-deleted-0001"
    )).rejects.toThrow("IDEMPOTENCY_RESULT_UNAVAILABLE")
    expect(await prisma.feedback.count({ where: { userId: user.id } })).toBe(0)
  })
})
