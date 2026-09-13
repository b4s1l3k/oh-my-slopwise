import { spawnSync } from "node:child_process"
import Ajv2020 from "ajv/dist/2020"
import addFormats from "ajv-formats"
import fixtureProtocolSchema from "../contracts/e2e/fixture-protocol.schema.json"
import {
  DEFAULT_E2E_FIXTURE,
  E2E_FIXTURE_PROTOCOL_VERSION,
  type E2eFixtureResponse,
} from "./support/fixture-contract"

const fixtureProtocolValidator = new Ajv2020({ allErrors: true })
addFormats(fixtureProtocolValidator)
const validateFixtureProtocol = fixtureProtocolValidator.compile(fixtureProtocolSchema)

export default async function globalSetup(): Promise<void> {
  const candidateAdapter = process.env.E2E_FIXTURE_ADAPTER?.trim()

  if (candidateAdapter) {
    resetCandidateFixture(candidateAdapter)
    return
  }

  if (process.env.E2E_EXTERNAL_SERVER === "true") {
    throw new Error(
      "E2E_EXTERNAL_SERVER requires E2E_FIXTURE_ADAPTER so tests cannot mutate a legacy database by mistake"
    )
  }

  const databaseUrl = legacyE2eDatabaseUrl()
  const { resetLegacyPrismaFixture } = await import("./support/legacy-prisma-fixture")
  await resetLegacyPrismaFixture(databaseUrl, DEFAULT_E2E_FIXTURE)
}

function legacyE2eDatabaseUrl(): string {
  const databaseUrl =
    process.env.E2E_DATABASE_URL ??
    "postgresql://splitwise:splitwise@localhost:5433/splitwise_e2e"

  if (!/[_-]e2e(?:\?|$)/.test(databaseUrl)) {
    throw new Error(`Refusing to reset a database without an e2e suffix: ${databaseUrl}`)
  }
  return databaseUrl
}

function resetCandidateFixture(adapterPath: string): void {
  if (!validateFixtureProtocol(DEFAULT_E2E_FIXTURE)) {
    throw new Error(
      `Canonical E2E fixture violates its schema: ${JSON.stringify(validateFixtureProtocol.errors)}`
    )
  }

  const result = spawnSync(adapterPath, [], {
    cwd: process.cwd(),
    encoding: "utf8",
    input: `${JSON.stringify(DEFAULT_E2E_FIXTURE)}\n`,
    maxBuffer: 1024 * 1024,
    timeout: 120_000,
  })

  if (result.error) {
    throw new Error(`Candidate fixture adapter failed to start: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(
      `Candidate fixture adapter exited with ${result.status}: ${result.stderr.trim()}`
    )
  }

  let response: E2eFixtureResponse
  try {
    response = JSON.parse(result.stdout.trim()) as E2eFixtureResponse
  } catch {
    throw new Error("Candidate fixture adapter returned invalid JSON")
  }

  if (!validateFixtureProtocol(response) || !("ok" in response)) {
    throw new Error(
      `Candidate fixture adapter violated the protocol: ${JSON.stringify(validateFixtureProtocol.errors)}`
    )
  }

  if (
    response.protocolVersion !== E2E_FIXTURE_PROTOCOL_VERSION ||
    response.ok !== true
  ) {
    const code = response.error?.code ?? "UNKNOWN_FIXTURE_ERROR"
    const message = response.error?.message ? `: ${response.error.message}` : ""
    throw new Error(`Candidate fixture adapter rejected reset (${code})${message}`)
  }
}
