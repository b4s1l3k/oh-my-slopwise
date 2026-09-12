import { spawnSync } from "node:child_process"
import {
  deriveTestDatabaseUrl,
  requireSafeTestDatabaseUrl,
} from "../src/test-utils/database-test-guard"

function run(command: string, args: string[], env: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, {
    env,
    stdio: "inherit",
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const applicationDatabaseUrl = process.env.DATABASE_URL
const candidateTestDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? deriveTestDatabaseUrl(applicationDatabaseUrl)
const testDatabaseUrl = requireSafeTestDatabaseUrl(
  candidateTestDatabaseUrl,
  applicationDatabaseUrl
)
const testEnvironment = {
  ...process.env,
  RUN_DB_INTEGRATION_TESTS: "true",
  TEST_DATABASE_URL: testDatabaseUrl,
}

run("npx", ["--no-install", "prisma", "migrate", "deploy"], {
  ...testEnvironment,
  DATABASE_URL: testDatabaseUrl,
})
run(
  process.execPath,
  [
    "./node_modules/vitest/vitest.mjs",
    "run",
    "--no-file-parallelism",
    ...process.argv.slice(2),
  ],
  testEnvironment
)
