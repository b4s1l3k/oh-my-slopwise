export type JsonPrimitive = boolean | number | string | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export type GoldenRequest = {
  protocolVersion: 1
  caseId: string
  operation: string
  input: JsonValue
}

export type GoldenOutcome =
  | { ok: true; value: JsonValue }
  | { ok: false; error: { code: string; message?: string } }

export type GoldenCase = {
  id: string
  description: string
  operation: string
  input: JsonValue
  expected: GoldenOutcome
  expectedByAdapter?: Partial<Record<GoldenAdapterKind, GoldenOutcome>>
}

export type GoldenSuite = {
  $schema: string
  schemaVersion: 1
  suite: string
  description: string
  cases: GoldenCase[]
}

export type GoldenManifest = {
  $schema: string
  schemaVersion: 1
  suites: string[]
}

export interface GoldenAdapter {
  readonly name: string
  readonly kind: GoldenAdapterKind
  execute(request: GoldenRequest): Promise<GoldenOutcome>
}

export type GoldenAdapterKind = "legacy" | "candidate"

export type GoldenFailure = {
  suite: string
  caseId: string
  operation: string
  expected: GoldenOutcome
  actual: GoldenOutcome
}

export type GoldenRunResult = {
  adapter: string
  adapterKind: GoldenAdapterKind
  total: number
  passed: number
  failures: GoldenFailure[]
  observations: GoldenObservation[]
}

export type GoldenObservation = {
  suite: string
  caseId: string
  operation: string
  expected: GoldenOutcome
  actual: GoldenOutcome
}

export type GoldenResponseDrift = {
  suite: string
  caseId: string
  operation: string
  expectedDifference: boolean
  legacy: GoldenOutcome
  candidate: GoldenOutcome
}
