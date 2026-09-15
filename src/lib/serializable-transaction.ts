import type { Prisma } from "@prisma/client"
import { Prisma as PrismaRuntime } from "@prisma/client"
import { prisma } from "@/lib/db"

const MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 10

function isRetryableTransactionConflict(error: unknown): boolean {
  if (error instanceof PrismaRuntime.PrismaClientKnownRequestError) {
    if (error.code === "P2034") return true

    // A PostgreSQL SSI failure raised while deferred constraint triggers commit
    // may reach Prisma as raw-query P2010. SQLSTATE 40001 remains retryable.
    if (error.code !== "P2010") return false
    const meta = error.meta as { code?: unknown; message?: unknown } | undefined
    return meta?.code === "40001" ||
      (typeof meta?.message === "string" && meta.message.includes("SQLSTATE 40001"))
  }

  // The driver adapter currently wraps PostgreSQL deadlocks as an unknown
  // Prisma error and retains SQLSTATE only in its formatted message.
  return error instanceof PrismaRuntime.PrismaClientUnknownRequestError &&
    /["']?code["']?\s*:\s*["']40P01["']/.test(error.message)
}

function backoff(attempt: number) {
  const exponential = BASE_BACKOFF_MS * 2 ** attempt
  const jitter = Math.floor(Math.random() * BASE_BACKOFF_MS)
  return new Promise((resolve) => setTimeout(resolve, exponential + jitter))
}

export async function runSerializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: PrismaRuntime.TransactionIsolationLevel.Serializable,
      })
    } catch (error) {
      if (!isRetryableTransactionConflict(error)) throw error
      if (attempt === MAX_ATTEMPTS - 1) throw new Error("TRANSACTION_CONFLICT")
      await backoff(attempt)
    }
  }

  throw new Error("TRANSACTION_CONFLICT")
}
