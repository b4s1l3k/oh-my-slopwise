import type { Prisma } from "@prisma/client"
import { Prisma as PrismaRuntime } from "@prisma/client"
import { prisma } from "@/lib/db"

const MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 10

function isSerializationConflict(error: unknown): boolean {
  return (
    error instanceof PrismaRuntime.PrismaClientKnownRequestError &&
    error.code === "P2034"
  )
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
      if (!isSerializationConflict(error)) throw error
      if (attempt === MAX_ATTEMPTS - 1) throw new Error("TRANSACTION_CONFLICT")
      await backoff(attempt)
    }
  }

  throw new Error("TRANSACTION_CONFLICT")
}
