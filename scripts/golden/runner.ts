import { isDeepStrictEqual } from "node:util"
import type {
  GoldenAdapter,
  GoldenAdapterKind,
  GoldenFailure,
  GoldenOutcome,
  GoldenRequest,
  GoldenResponseDrift,
  GoldenRunResult,
  GoldenSuite,
} from "./types"

function expectation(
  expected: GoldenOutcome,
  expectedByAdapter: Partial<Record<GoldenAdapterKind, GoldenOutcome>> | undefined,
  kind: GoldenAdapterKind
): GoldenOutcome {
  return expectedByAdapter?.[kind] ?? expected
}

function jsonPathDifferences(expected: unknown, actual: unknown, path = "$"): string[] {
  if (isDeepStrictEqual(expected, actual)) return []
  if (
    expected == null ||
    actual == null ||
    typeof expected !== "object" ||
    typeof actual !== "object" ||
    Array.isArray(expected) !== Array.isArray(actual)
  ) {
    return [`${path}: expected ${JSON.stringify(expected)}, actual ${JSON.stringify(actual)}`]
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    const differences: string[] = []
    if (expected.length !== actual.length) {
      differences.push(`${path}.length: expected ${expected.length}, actual ${actual.length}`)
    }
    for (let index = 0; index < Math.max(expected.length, actual.length); index += 1) {
      if (index >= expected.length) {
        differences.push(`${path}[${index}]: unexpected ${JSON.stringify(actual[index])}`)
      } else if (index >= actual.length) {
        differences.push(`${path}[${index}]: missing ${JSON.stringify(expected[index])}`)
      } else {
        differences.push(...jsonPathDifferences(expected[index], actual[index], `${path}[${index}]`))
      }
    }
    return differences
  }

  const expectedObject = expected as Record<string, unknown>
  const actualObject = actual as Record<string, unknown>
  return [...new Set([...Object.keys(expectedObject), ...Object.keys(actualObject)])]
    .sort()
    .flatMap((key) => {
      const childPath = `${path}.${key}`
      if (!(key in expectedObject)) {
        return [`${childPath}: unexpected ${JSON.stringify(actualObject[key])}`]
      }
      if (!(key in actualObject)) {
        return [`${childPath}: missing ${JSON.stringify(expectedObject[key])}`]
      }
      return jsonPathDifferences(expectedObject[key], actualObject[key], childPath)
    })
}

export async function runGoldenSuites(
  suites: GoldenSuite[],
  adapter: GoldenAdapter
): Promise<GoldenRunResult> {
  const failures: GoldenFailure[] = []
  const observations: GoldenRunResult["observations"] = []
  let total = 0

  for (const suite of suites) {
    for (const testCase of suite.cases) {
      total += 1
      const request: GoldenRequest = {
        protocolVersion: 1,
        caseId: testCase.id,
        operation: testCase.operation,
        input: testCase.input,
      }
      const actual = await adapter.execute(request)
      const expected = expectation(testCase.expected, testCase.expectedByAdapter, adapter.kind)
      observations.push({
        suite: suite.suite,
        caseId: testCase.id,
        operation: testCase.operation,
        expected,
        actual,
      })
      if (!isDeepStrictEqual(actual, expected)) {
        failures.push({
          suite: suite.suite,
          caseId: testCase.id,
          operation: testCase.operation,
          expected,
          actual,
        })
      }
    }
  }

  return {
    adapter: adapter.name,
    adapterKind: adapter.kind,
    total,
    passed: total - failures.length,
    failures,
    observations,
  }
}

export function formatGoldenFailures(failures: GoldenFailure[]): string {
  return failures
    .map(
      (failure) =>
        `[${failure.suite}/${failure.caseId}] ${failure.operation}\n` +
        `expected: ${JSON.stringify(failure.expected)}\n` +
        `actual:   ${JSON.stringify(failure.actual)}\n` +
        `diff:\n${jsonPathDifferences(failure.expected, failure.actual)
          .map((difference) => `  ${difference}`)
          .join("\n")}`
    )
    .join("\n\n")
}

export function findGoldenResponseDrift(
  suites: GoldenSuite[],
  legacy: GoldenRunResult,
  candidate: GoldenRunResult
): GoldenResponseDrift[] {
  const candidateByCase = new Map(
    candidate.observations.map((observation) => [`${observation.suite}/${observation.caseId}`, observation])
  )
  const caseById = new Map<string, GoldenSuite["cases"][number]>(
    suites.flatMap((suite) =>
      suite.cases.map((testCase) => [`${suite.suite}/${testCase.id}`, testCase] as const)
    )
  )

  return legacy.observations.flatMap((legacyObservation) => {
    const key = `${legacyObservation.suite}/${legacyObservation.caseId}`
    const candidateObservation = candidateByCase.get(key)
    const testCase = caseById.get(key)
    if (!candidateObservation || !testCase) return []
    if (isDeepStrictEqual(legacyObservation.actual, candidateObservation.actual)) return []
    const legacyExpected = expectation(
      testCase.expected,
      testCase.expectedByAdapter,
      "legacy"
    )
    const candidateExpected = expectation(
      testCase.expected,
      testCase.expectedByAdapter,
      "candidate"
    )
    return [{
      suite: legacyObservation.suite,
      caseId: legacyObservation.caseId,
      operation: legacyObservation.operation,
      expectedDifference:
        !isDeepStrictEqual(legacyExpected, candidateExpected) &&
        isDeepStrictEqual(legacyObservation.actual, legacyExpected) &&
        isDeepStrictEqual(candidateObservation.actual, candidateExpected),
      legacy: legacyObservation.actual,
      candidate: candidateObservation.actual,
    }]
  })
}

export function formatGoldenResponseDrift(drift: GoldenResponseDrift[]): string {
  if (drift.length === 0) return "Response drift: none"
  return [
    `Response drift: ${drift.length}`,
    ...drift.map(
      (item) =>
        `[${item.expectedDifference ? "expected" : "unexpected"}] ` +
        `${item.suite}/${item.caseId} ${item.operation}\n` +
        `legacy:    ${JSON.stringify(item.legacy)}\n` +
        `candidate: ${JSON.stringify(item.candidate)}`
    ),
  ].join("\n\n")
}
