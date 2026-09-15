import { PrismaClient } from "@prisma/client"
import { buildRuntimeDatabaseUrl } from "@/lib/database-url"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
const runtimeDatabaseUrl = buildRuntimeDatabaseUrl(process.env.DATABASE_URL)

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({
    log: ["error"],
    ...(runtimeDatabaseUrl ? { datasourceUrl: runtimeDatabaseUrl } : {}),
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
