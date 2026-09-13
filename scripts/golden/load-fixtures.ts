import { readFileSync } from "node:fs"
import { dirname, relative, resolve, sep } from "node:path"
import type {
  GoldenCase,
  GoldenManifest,
  GoldenOutcome,
  GoldenSuite,
  JsonValue,
} from "./types"

const CASE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]+$/
const OPERATION_PATTERN = /^[a-z]+(?:[A-Za-z]+)?\.[a-zA-Z]+$/
const SUITE_PATH_PATTERN = /^fixtures\/[a-z0-9][a-z0-9._-]*\.json$/

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  context: string
): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unexpected.length > 0) {
    throw new Error(`${context} has unexpected properties: ${unexpected.join(", ")}`)
  }
}

function object(value: unknown, context: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be an object`)
  }
  return value as Record<string, unknown>
}

function string(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context} must be a non-empty string`)
  }
  return value
}

function jsonValue(value: unknown, context: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${context} must contain only finite numbers`)
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => jsonValue(item, `${context}[${index}]`))
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, jsonValue(item, `${context}.${key}`)])
    )
  }
  throw new Error(`${context} must be a JSON value`)
}

export function parseGoldenOutcome(value: unknown, context: string): GoldenOutcome {
  const candidate = object(value, context)
  if (candidate.ok === true && "value" in candidate) {
    exactKeys(candidate, ["ok", "value"], context)
    return { ok: true, value: jsonValue(candidate.value, `${context}.value`) }
  }
  if (candidate.ok === false) {
    exactKeys(candidate, ["ok", "error"], context)
    const error = object(candidate.error, `${context}.error`)
    exactKeys(error, ["code", "message"], `${context}.error`)
    if ("message" in error && typeof error.message !== "string") {
      throw new Error(`${context}.error.message must be a string`)
    }
    return {
      ok: false,
      error: {
        code: string(error.code, `${context}.error.code`),
        ...(typeof error.message === "string" ? { message: error.message } : {}),
      },
    }
  }
  throw new Error(`${context} must be a golden outcome`)
}

function goldenCase(value: unknown, context: string): GoldenCase {
  const candidate = object(value, context)
  exactKeys(
    candidate,
    ["id", "description", "operation", "input", "expected", "expectedByAdapter"],
    context
  )
  if (!("input" in candidate)) throw new Error(`${context}.input is required`)
  const expectedByAdapter = candidate.expectedByAdapter == null
    ? undefined
    : Object.fromEntries(
        Object.entries(object(candidate.expectedByAdapter, `${context}.expectedByAdapter`)).map(
          ([adapter, expected]) => {
            if (adapter !== "legacy" && adapter !== "candidate") {
              throw new Error(`${context}.expectedByAdapter has unknown adapter ${adapter}`)
            }
            return [adapter, parseGoldenOutcome(expected, `${context}.expectedByAdapter.${adapter}`)]
          }
        )
      ) as GoldenCase["expectedByAdapter"]
  if (expectedByAdapter != null && Object.keys(expectedByAdapter).length === 0) {
    throw new Error(`${context}.expectedByAdapter must not be empty`)
  }
  const id = string(candidate.id, `${context}.id`)
  const operation = string(candidate.operation, `${context}.operation`)
  if (!CASE_ID_PATTERN.test(id)) throw new Error(`${context}.id has invalid format`)
  if (!OPERATION_PATTERN.test(operation)) {
    throw new Error(`${context}.operation has invalid format`)
  }
  return {
    id,
    description: string(candidate.description, `${context}.description`),
    operation,
    input: jsonValue(candidate.input, `${context}.input`),
    expected: parseGoldenOutcome(candidate.expected, `${context}.expected`),
    ...(expectedByAdapter == null ? {} : { expectedByAdapter }),
  }
}

function suite(value: unknown, path: string): GoldenSuite {
  const candidate = object(value, path)
  exactKeys(candidate, ["$schema", "schemaVersion", "suite", "description", "cases"], path)
  if (candidate.$schema !== "../schema/golden-suite.schema.json") {
    throw new Error(`${path}.$schema must reference the canonical golden schema`)
  }
  if (candidate.schemaVersion !== 1) throw new Error(`${path}.schemaVersion must be 1`)
  if (!Array.isArray(candidate.cases) || candidate.cases.length === 0) {
    throw new Error(`${path}.cases must be a non-empty array`)
  }
  return {
    $schema: string(candidate.$schema, `${path}.$schema`),
    schemaVersion: 1,
    suite: string(candidate.suite, `${path}.suite`),
    description: string(candidate.description, `${path}.description`),
    cases: candidate.cases.map((item, index) => goldenCase(item, `${path}.cases[${index}]`)),
  }
}

export function loadGoldenSuites(goldenRoot: string): GoldenSuite[] {
  const manifestPath = resolve(goldenRoot, "manifest.json")
  const manifest = object(JSON.parse(readFileSync(manifestPath, "utf8")), manifestPath)
  exactKeys(manifest, ["$schema", "schemaVersion", "suites"], manifestPath)
  if (
    manifest.$schema !== "schema/golden-manifest.schema.json" ||
    manifest.schemaVersion !== 1 ||
    !Array.isArray(manifest.suites) ||
    manifest.suites.length === 0
  ) {
    throw new Error(`${manifestPath} must reference the canonical manifest schema and contain schemaVersion 1 and suites`)
  }
  const suitePaths = manifest.suites.map((path, index) =>
    string(path, `${manifestPath}.suites[${index}]`)
  )
  if (new Set(suitePaths).size !== suitePaths.length) {
    throw new Error("Golden manifest suite paths must be unique")
  }
  const typedManifest: GoldenManifest = {
    $schema: "schema/golden-manifest.schema.json",
    schemaVersion: 1,
    suites: suitePaths,
  }
  const suites = typedManifest.suites.map((relativePath) => {
    if (!SUITE_PATH_PATTERN.test(relativePath)) {
      throw new Error(`Golden suite path has invalid format: ${relativePath}`)
    }
    const path = resolve(dirname(manifestPath), relativePath)
    const pathFromRoot = relative(resolve(goldenRoot), path)
    if (pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === "") {
      throw new Error(`Golden suite path must stay inside golden root: ${relativePath}`)
    }
    return suite(JSON.parse(readFileSync(path, "utf8")), path)
  })

  const suiteNames = suites.map((item) => item.suite)
  if (new Set(suiteNames).size !== suiteNames.length) throw new Error("Golden suite names must be unique")

  const caseIds = suites.flatMap((item) => item.cases.map((testCase) => testCase.id))
  if (new Set(caseIds).size !== caseIds.length) throw new Error("Golden case ids must be globally unique")
  return suites
}
