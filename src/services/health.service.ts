import { prisma } from "@/lib/db"

const READINESS_TIMEOUT_MS = 2_000

type HealthDatabase = Pick<typeof prisma, "$queryRaw">

export async function checkDatabaseReadiness(
  db: HealthDatabase = prisma,
  timeoutMs = READINESS_TIMEOUT_MS
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("READINESS_TIMEOUT")), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
