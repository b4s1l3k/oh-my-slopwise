import { spawnSync } from "node:child_process"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import globalSetup from "../../e2e/global-setup"
import { resetLegacyPrismaFixture } from "../../e2e/support/legacy-prisma-fixture"

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}))

vi.mock("../../e2e/support/legacy-prisma-fixture", () => ({
  resetLegacyPrismaFixture: vi.fn(),
}))

const spawnSyncMock = vi.mocked(spawnSync)
const resetLegacyPrismaFixtureMock = vi.mocked(resetLegacyPrismaFixture)

describe("E2E global setup boundary", () => {
  beforeEach(() => {
    spawnSyncMock.mockReset()
    resetLegacyPrismaFixtureMock.mockReset()
    vi.stubEnv("E2E_FIXTURE_ADAPTER", "")
    vi.stubEnv("E2E_EXTERNAL_SERVER", "")
    vi.stubEnv("E2E_DATABASE_URL", "")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("uses the candidate adapter without reading legacy database configuration", async () => {
    vi.stubEnv("E2E_FIXTURE_ADAPTER", "/opt/candidate/e2e-fixtures")
    vi.stubEnv("E2E_EXTERNAL_SERVER", "true")
    vi.stubEnv("E2E_DATABASE_URL", "postgresql://db.example/production")
    spawnSyncMock.mockReturnValue(successfulAdapterResult())

    await expect(globalSetup()).resolves.toBeUndefined()

    expect(resetLegacyPrismaFixtureMock).not.toHaveBeenCalled()
    expect(spawnSyncMock).toHaveBeenCalledOnce()
    const [command, args, options] = spawnSyncMock.mock.calls[0]
    expect(command).toBe("/opt/candidate/e2e-fixtures")
    expect(args).toEqual([])
    expect(JSON.parse(String(options?.input).trim())).toMatchObject({
      protocolVersion: 1,
      operation: "reset-and-seed",
      fixtureSet: "default",
    })
  })

  it("requires a language-neutral fixture adapter for an external server", async () => {
    vi.stubEnv("E2E_EXTERNAL_SERVER", "true")

    await expect(globalSetup()).rejects.toThrow(
      "E2E_EXTERNAL_SERVER requires E2E_FIXTURE_ADAPTER"
    )
    expect(resetLegacyPrismaFixtureMock).not.toHaveBeenCalled()
  })

  it("keeps the destructive database-name guard inside the legacy adapter path", async () => {
    vi.stubEnv("E2E_DATABASE_URL", "postgresql://localhost/production")

    await expect(globalSetup()).rejects.toThrow(
      "Refusing to reset a database without an e2e suffix"
    )
    expect(resetLegacyPrismaFixtureMock).not.toHaveBeenCalled()
  })

  it("passes an isolated database and the canonical fixture to the legacy adapter", async () => {
    const databaseUrl = "postgresql://localhost/splitwise_e2e"
    vi.stubEnv("E2E_DATABASE_URL", databaseUrl)

    await globalSetup()

    expect(resetLegacyPrismaFixtureMock).toHaveBeenCalledOnce()
    expect(resetLegacyPrismaFixtureMock).toHaveBeenCalledWith(
      databaseUrl,
      expect.objectContaining({ protocolVersion: 1, operation: "reset-and-seed" })
    )
    expect(spawnSyncMock).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: "non-zero exit",
      result: { ...successfulAdapterResult(), status: 23, stderr: "reset failed" },
      error: "Candidate fixture adapter exited with 23: reset failed",
    },
    {
      name: "invalid JSON",
      result: { ...successfulAdapterResult(), stdout: "not-json" },
      error: "Candidate fixture adapter returned invalid JSON",
    },
    {
      name: "protocol rejection",
      result: {
        ...successfulAdapterResult(),
        stdout: JSON.stringify({
          protocolVersion: 1,
          ok: false,
          error: { code: "RESET_FAILED", message: "database unavailable" },
        }),
      },
      error: "Candidate fixture adapter rejected reset (RESET_FAILED): database unavailable",
    },
  ])("fails before browser tests on $name", async ({ result, error }) => {
    vi.stubEnv("E2E_FIXTURE_ADAPTER", "/opt/candidate/e2e-fixtures")
    spawnSyncMock.mockReturnValue(result)

    await expect(globalSetup()).rejects.toThrow(error)
    expect(resetLegacyPrismaFixtureMock).not.toHaveBeenCalled()
  })
})

function successfulAdapterResult(): ReturnType<typeof spawnSync> {
  return {
    pid: 123,
    output: [null, JSON.stringify({ protocolVersion: 1, ok: true }), ""],
    stdout: JSON.stringify({ protocolVersion: 1, ok: true }),
    stderr: "",
    status: 0,
    signal: null,
  }
}
