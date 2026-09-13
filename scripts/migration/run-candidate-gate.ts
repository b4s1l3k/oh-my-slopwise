import { spawnSync } from "node:child_process"

const goldenAdapter = requiredEnvironment("CANDIDATE_GOLDEN_ADAPTER")
const fixtureAdapter = requiredEnvironment("E2E_FIXTURE_ADAPTER")
const e2eBaseUrl = requiredEnvironment("E2E_BASE_URL")

assertHttpUrl(e2eBaseUrl)

run(npmCommand(), ["run", "contract:check"])
run(npmCommand(), ["run", "typecheck"])
run(npmCommand(), ["test"])
run(npmCommand(), ["run", "build"])
run(process.execPath, [
  "--import",
  "tsx",
  "scripts/golden/run.ts",
  "compare",
  goldenAdapter,
])
run(npxCommand(), ["playwright", "test"], {
  E2E_EXTERNAL_SERVER: "true",
  E2E_BASE_URL: e2eBaseUrl,
  E2E_FIXTURE_ADAPTER: fixtureAdapter,
})

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required for the candidate migration gate`)
  }
  return value
}

function assertHttpUrl(value: string): void {
  const url = new URL(value)
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("E2E_BASE_URL must use http or https")
  }
}

function run(
  command: string,
  args: string[],
  environment: Record<string, string> = {}
): void {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...environment },
    stdio: "inherit",
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm"
}

function npxCommand(): string {
  return process.platform === "win32" ? "npx.cmd" : "npx"
}
