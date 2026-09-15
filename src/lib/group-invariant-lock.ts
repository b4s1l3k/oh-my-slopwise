import type { Prisma } from "@prisma/client"

/**
 * Acquires the database-owned per-group transaction lock before a mutation
 * can take row locks in a conflicting order. The cast keeps PostgreSQL's void
 * return type away from Prisma's raw-result decoder.
 */
export async function lockGroupInvariants(
  tx: Prisma.TransactionClient,
  groupId: string
): Promise<void> {
  await tx.$queryRaw<Array<{ locked: string }>>`
    SELECT lock_group_invariants(${groupId})::text AS locked
  `
}
