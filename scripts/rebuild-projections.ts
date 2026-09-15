import {
  deriveTestDatabaseUrl,
  requireSafeTestDatabaseUrl,
} from "../src/test-utils/database-test-guard"

function configureDatabaseUrl() {
  if (process.argv[2] !== "--test") return
  const applicationDatabaseUrl = process.env.DATABASE_URL
  process.env.DATABASE_URL = requireSafeTestDatabaseUrl(
    process.env.TEST_DATABASE_URL ?? deriveTestDatabaseUrl(applicationDatabaseUrl),
    applicationDatabaseUrl
  )
}

async function main() {
  configureDatabaseUrl()
  const { prisma } = await import("../src/lib/db")
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT rebuild_group_member_positions()`
      await tx.$executeRaw`SELECT rebuild_user_statistic_projections()`
    }, { timeout: 120_000 })
  } finally {
    await prisma.$disconnect()
  }
  console.log("Balance and statistic projections rebuilt successfully")
}

main()
  .catch((error) => {
    console.error("Projection rebuild failed", error)
    process.exitCode = 1
  })
