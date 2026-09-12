import { requireSafeTestDatabaseUrl } from "@/test-utils/database-test-guard"

if (process.env.RUN_DB_INTEGRATION_TESTS === "true") {
  process.env.DATABASE_URL = requireSafeTestDatabaseUrl(
    process.env.TEST_DATABASE_URL,
    process.env.DATABASE_URL
  )
}
