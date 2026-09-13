import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import Ajv2020 from "ajv/dist/2020"
import { describe, expect, it } from "vitest"
import { CandidateProcessAdapter } from "../../scripts/golden/candidate-process-adapter"
import { LegacyGoldenAdapter } from "../../scripts/golden/legacy-adapter"
import {
  loadGoldenSuites,
  parseGoldenOutcome,
} from "../../scripts/golden/load-fixtures"
import {
  findGoldenResponseDrift,
  formatGoldenFailures,
  runGoldenSuites,
} from "../../scripts/golden/runner"
import type { GoldenAdapter, GoldenOutcome } from "../../scripts/golden/types"

const goldenRoot = resolve(import.meta.dirname)
const suites = loadGoldenSuites(goldenRoot)

describe("language-neutral golden compatibility suites", () => {
  it("validates the manifest, every fixture and adapter examples against JSON Schema", () => {
    const ajv = new Ajv2020({ allErrors: true })
    const manifest = JSON.parse(readFileSync(resolve(goldenRoot, "manifest.json"), "utf8")) as {
      suites: string[]
    }
    const manifestSchema = JSON.parse(
      readFileSync(resolve(goldenRoot, "schema/golden-manifest.schema.json"), "utf8")
    )
    const suiteSchema = JSON.parse(
      readFileSync(resolve(goldenRoot, "schema/golden-suite.schema.json"), "utf8")
    )
    const protocolSchema = JSON.parse(
      readFileSync(resolve(goldenRoot, "schema/golden-protocol.schema.json"), "utf8")
    )
    const validateManifest = ajv.compile(manifestSchema)
    const validateSuite = ajv.compile(suiteSchema)
    const validateProtocol = ajv.compile(protocolSchema)

    expect(validateManifest(manifest), JSON.stringify(validateManifest.errors)).toBe(true)
    for (const path of manifest.suites) {
      const fixture = JSON.parse(readFileSync(resolve(goldenRoot, path), "utf8"))
      expect(validateSuite(fixture), `${path}: ${JSON.stringify(validateSuite.errors)}`).toBe(true)
    }
    expect(validateProtocol({
      protocolVersion: 1,
      caseId: "protocol.schema",
      operation: "protocol.schema",
      input: { exact: true },
    }), JSON.stringify(validateProtocol.errors)).toBe(true)
    expect(validateProtocol({ ok: false, error: { code: "EXAMPLE" } })).toBe(true)
  })

  it("cover every required migration behavior area", () => {
    const operations = new Set(
      suites.flatMap((suite) => suite.cases.map((testCase) => testCase.operation))
    )
    expect(operations).toEqual(
      new Set([
        "expense.calculateSplits",
        "expense.convertAndAllocate",
        "expense.authorizeMutation",
        "expense.parseCommand",
        "expense.reconcileCashOnEdit",
        "expense.validateCommand",
        "fx.convertBetween",
        "fx.selectNearestRate",
        "money.currencyPolicy",
        "ledger.mutationPolicy",
        "balance.calculate",
        "settlement.apply",
        "settlement.parseCommand",
        "settlement.reset",
        "settlement.validateCommand",
        "membership.acceptInvite",
        "membership.leave",
        "date.evaluateBusinessDate",
        "date.parseCalendarDate",
        "group.validateCreate",
        "group.validateUpdate",
        "statistics.buildProfile",
        "statistics.reduceEffectiveHistory",
        "achievements.evaluate",
        "auth.passwordWithinBcryptLimit",
        "auth.projectSession",
        "auth.validateRegistration",
        "error.mapService",
      ])
    )
  })

  it("the legacy TypeScript adapter matches every golden fixture", async () => {
    const result = await runGoldenSuites(suites, new LegacyGoldenAdapter())
    expect(result.failures, formatGoldenFailures(result.failures)).toEqual([])
    expect(result.passed).toBe(result.total)
    expect(result.total).toBe(186)
  })

  it("the candidate process adapter uses the versioned JSON stdin/stdout protocol", async () => {
    const candidateScript = [
      "let input = '';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', chunk => input += chunk);",
      "process.stdin.on('end', () => {",
      "  const request = JSON.parse(input);",
      "  process.stdout.write(JSON.stringify({ ok: true, value: request.input }));",
      "});",
    ].join("\n")
    const adapter = new CandidateProcessAdapter(process.execPath, ["-e", candidateScript])

    await expect(
      adapter.execute({
        protocolVersion: 1,
        caseId: "protocol.echo",
        operation: "protocol.echo",
        input: { value: 42 },
      })
    ).resolves.toEqual({ ok: true, value: { value: 42 } })
  })

  it("force-kills a candidate that ignores the timeout signal", async () => {
    const candidateScript = [
      "process.on('SIGTERM', () => {});",
      "process.stdin.resume();",
      "setInterval(() => {}, 1000);",
    ].join("\n")
    const adapter = new CandidateProcessAdapter(
      process.execPath,
      ["-e", candidateScript],
      25
    )

    await expect(
      adapter.execute({
        protocolVersion: 1,
        caseId: "protocol.timeout",
        operation: "protocol.timeout",
        input: null,
      })
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "CANDIDATE_TIMEOUT",
        message: "candidate exceeded 25ms",
      },
    })
  })

  it("rejects candidate output that is not an exact protocol outcome", async () => {
    const candidateScript = "process.stdout.write(JSON.stringify({ ok: true, value: null, extra: true }))"
    const adapter = new CandidateProcessAdapter(process.execPath, ["-e", candidateScript])

    await expect(
      adapter.execute({
        protocolVersion: 1,
        caseId: "protocol.strict-output",
        operation: "protocol.strictOutput",
        input: null,
      })
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "CANDIDATE_INVALID_OUTPUT",
        message: expect.stringContaining("unexpected properties: extra"),
      },
    })
  })

  it("rejects ambiguous or malformed outcomes before execution", () => {
    expect(() =>
      parseGoldenOutcome({ ok: true, value: null, error: { code: "NOPE" } }, "fixture")
    ).toThrow("unexpected properties: error")
    expect(() =>
      parseGoldenOutcome({ ok: false, error: { code: "NOPE", message: 42 } }, "fixture")
    ).toThrow("error.message must be a string")
    expect(() =>
      parseGoldenOutcome({ ok: true, value: { amount: Number.POSITIVE_INFINITY } }, "fixture")
    ).toThrow("must contain only finite numbers")
  })

  it("reports exact JSON paths for nested response regressions", () => {
    const output = formatGoldenFailures([
      {
        suite: "diagnostics",
        caseId: "diagnostics.nested",
        operation: "test.compare",
        expected: { ok: true, value: { rows: [{ amount: 10 }] } },
        actual: { ok: true, value: { rows: [{ amount: 11, leaked: true }] } },
      },
    ])

    expect(output).toContain("$.value.rows[0].amount: expected 10, actual 11")
    expect(output).toContain("$.value.rows[0].leaked: unexpected true")
  })

  it("compare mode distinguishes ADR-approved drift from an unexpected regression", async () => {
    class FixtureAdapter implements GoldenAdapter {
      constructor(
        readonly name: string,
        readonly kind: "legacy" | "candidate",
        private readonly values: Map<string, GoldenOutcome>
      ) {}

      async execute(request: { caseId: string }): Promise<GoldenOutcome> {
        return this.values.get(request.caseId) ?? { ok: true, value: null }
      }
    }

    const comparisonSuites = [
      {
        $schema: "test",
        schemaVersion: 1 as const,
        suite: "comparison",
        description: "comparison",
        cases: [
          {
            id: "expected-drift",
            description: "expected",
            operation: "test.compare",
            input: null,
            expected: { ok: true as const, value: "candidate" },
            expectedByAdapter: { legacy: { ok: true as const, value: "legacy" } },
          },
          {
            id: "unexpected-drift",
            description: "unexpected",
            operation: "test.compare",
            input: null,
            expected: { ok: true as const, value: "same" },
          },
        ],
      },
    ]
    const legacy = await runGoldenSuites(
      comparisonSuites,
      new FixtureAdapter(
        "legacy",
        "legacy",
        new Map([
          ["expected-drift", { ok: true, value: "legacy" }],
          ["unexpected-drift", { ok: true, value: "same" }],
        ])
      )
    )
    const candidate = await runGoldenSuites(
      comparisonSuites,
      new FixtureAdapter(
        "candidate",
        "candidate",
        new Map([
          ["expected-drift", { ok: true, value: "candidate" }],
          ["unexpected-drift", { ok: true, value: "regression" }],
        ])
      )
    )

    expect(findGoldenResponseDrift(comparisonSuites, legacy, candidate)).toMatchObject([
      { caseId: "expected-drift", expectedDifference: true },
      { caseId: "unexpected-drift", expectedDifference: false },
    ])

    const regressedCandidate = await runGoldenSuites(
      comparisonSuites,
      new FixtureAdapter(
        "candidate",
        "candidate",
        new Map([
          ["expected-drift", { ok: true, value: "third-unapproved-value" }],
          ["unexpected-drift", { ok: true, value: "same" }],
        ])
      )
    )
    expect(findGoldenResponseDrift(comparisonSuites, legacy, regressedCandidate)).toMatchObject([
      { caseId: "expected-drift", expectedDifference: false },
    ])
  })
})
