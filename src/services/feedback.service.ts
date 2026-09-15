import { prisma } from "@/lib/db"
import { runIdempotentCommand } from "@/lib/idempotent-command"

export async function createFeedback(
  userId: string,
  message: string,
  idempotencyKey?: string
) {
  // Preserve the legacy one-query path for callers that do not send a key.
  // Keyed requests need the transaction below so the resource and dedupe
  // record can never commit independently.
  if (!idempotencyKey) {
    return prisma.feedback.create({ data: { userId, message } })
  }

  return runIdempotentCommand({
    principalId: userId,
    operation: "CREATE_FEEDBACK",
    key: idempotencyKey,
    request: { message },
    prepare: async () => undefined,
    execute: async (tx) => {
      const feedback = await tx.feedback.create({ data: { userId, message } })
      return { result: feedback, resourceId: feedback.id }
    },
    load: (tx, resourceId) => tx.feedback.findUnique({ where: { id: resourceId } }),
  })
}

export async function listFeedback() {
  return prisma.feedback.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
    include: { user: { select: { name: true, email: true } } },
  })
}
