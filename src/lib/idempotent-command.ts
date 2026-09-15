import { createHash } from "node:crypto"
import type { IdempotencyOperation, Prisma } from "@prisma/client"
import { Prisma as PrismaRuntime } from "@prisma/client"
import { prisma } from "@/lib/db"
import { runSerializableTransaction } from "@/lib/serializable-transaction"
import { canonicalJson } from "@/lib/canonical-json"

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000
const IDEMPOTENCY_CLEANUP_BATCH_SIZE = 1_000

export function hashIdempotencyRequest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex")
}

type CommandResult<T> = {
  result: T
  resourceId: string
}

type IdempotentCommandOptions<T, Prepared> = {
  principalId: string
  operation: IdempotencyOperation
  key?: string
  request: unknown
  preflightReplay?: boolean
  prepare: () => Promise<Prepared>
  execute: (tx: Prisma.TransactionClient, prepared: Prepared) => Promise<CommandResult<T>>
  load: (tx: Prisma.TransactionClient, resourceId: string) => Promise<T | null>
}

function isIdempotencyUniqueConflict(error: unknown): boolean {
  if (!(error instanceof PrismaRuntime.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false
  }
  const target = error.meta?.target
  return Array.isArray(target)
    ? target.includes("principalId") && target.includes("operation") && target.includes("key")
    : String(target).includes("idempotency_records_principalId_operation_key_key")
}

export async function runIdempotentCommand<T, Prepared>(
  options: IdempotentCommandOptions<T, Prepared>
): Promise<T> {
  const {
    principalId,
    operation,
    key,
    request,
    preflightReplay = false,
    prepare,
    execute,
    load,
  } = options

  if (!key) {
    const prepared = await prepare()
    return runSerializableTransaction(async (tx) => (await execute(tx, prepared)).result)
  }

  const requestHash = hashIdempotencyRequest(request)

  const replay = async (): Promise<T | null> => {
    const record = await prisma.idempotencyRecord.findUnique({
      where: { principalId_operation_key: { principalId, operation, key } },
    })
    if (!record || record.expiresAt <= new Date()) return null
    if (record.requestHash !== requestHash) throw new Error("IDEMPOTENCY_KEY_REUSED")
    const result = await prisma.$transaction((tx) => load(tx, record.resourceId))
    if (!result) throw new Error("IDEMPOTENCY_RESULT_UNAVAILABLE")
    return result
  }

  if (preflightReplay) {
    const existing = await replay()
    if (existing) return existing
  }

  const prepared = await prepare()
  try {
    return await runSerializableTransaction(async (tx) => {
      const now = new Date()
      // Cleanup and lookup share one round trip. The principal-first expiry
      // index selects a bounded batch, and CTIDs let PostgreSQL delete that
      // batch directly instead of scanning the whole idempotency table.
      const [record] = await tx.$queryRaw<Array<{
        requestHash: string
        resourceId: string
      }>>`
        WITH expired AS (
          DELETE FROM "idempotency_records"
          WHERE ctid = ANY(ARRAY(
            SELECT ctid
            FROM (
              SELECT ctid, "expiresAt"
              FROM "idempotency_records"
              WHERE "principalId" = ${principalId}
                AND "expiresAt" <= ${now}
              ORDER BY "expiresAt"
              LIMIT ${IDEMPOTENCY_CLEANUP_BATCH_SIZE}
            ) AS cleanup_batch
            UNION
            SELECT ctid
            FROM "idempotency_records"
            WHERE "principalId" = ${principalId}
              AND "operation" = ${operation}::"IdempotencyOperation"
              AND "key" = ${key}
              AND "expiresAt" <= ${now}
          ))
        )
        SELECT "requestHash", "resourceId"
        FROM "idempotency_records"
        WHERE "principalId" = ${principalId}
          AND "operation" = ${operation}::"IdempotencyOperation"
          AND "key" = ${key}
          AND "expiresAt" > ${now}
      `
      if (record) {
        if (record.requestHash !== requestHash) throw new Error("IDEMPOTENCY_KEY_REUSED")
        const result = await load(tx, record.resourceId)
        if (!result) throw new Error("IDEMPOTENCY_RESULT_UNAVAILABLE")
        return result
      }

      const command = await execute(tx, prepared)
      await tx.idempotencyRecord.create({
        data: {
          principalId,
          operation,
          key,
          requestHash,
          resourceId: command.resourceId,
          expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
        },
      })
      return command.result
    })
  } catch (error) {
    if (!isIdempotencyUniqueConflict(error)) throw error
    const existingAfterConflict = await replay()
    if (!existingAfterConflict) throw error
    return existingAfterConflict
  }
}
