# Language-neutral golden compatibility contract

The 186 JSON vectors in 13 focused suites in this directory make legacy and candidate backend behavior
comparable during migration. They are intentionally independent of TypeScript,
Vitest, Prisma and HTTP transport. Most cases have one common expectation. An
ADR-approved correction may use `expectedByAdapter` so a candidate is not
forced to preserve a known legacy defect; the compare report then labels that
response drift as expected.

## Fixture format

`manifest.json` lists versioned suites. Every case contains a stable ID, a
language-neutral operation name, JSON input and an exact outcome:

```json
{
  "id": "dates.leap-day",
  "operation": "date.parseCalendarDate",
  "input": { "value": "2024-02-29" },
  "expected": { "ok": true, "value": { "iso": "2024-02-29T00:00:00.000Z" } }
}
```

The canonical JSON Schemas are `schema/golden-manifest.schema.json`,
`schema/golden-suite.schema.json` and the standalone adapter wire contract
`schema/golden-protocol.schema.json`. The loader additionally rejects duplicate
suite paths/names/case IDs, paths outside this directory, non-finite JSON
numbers, empty adapter overrides and malformed outcomes before any adapter is
executed. Monetary values
use the current v1 convention: integer hundredths of the displayed currency,
including currencies such as JPY. Percentages use basis points.

## Adapters and runner

The legacy adapter calls existing pure production functions where they exist
and supplies a deterministic compatibility harness around stateful service
rules. Run it from the repository root:

```bash
node --import tsx scripts/golden/run.ts legacy
```

The candidate adapter executes any command that implements protocol version 1:

```bash
node --import tsx scripts/golden/run.ts candidate ./candidate-golden-adapter
```

To verify both implementations and print every response difference:

```bash
node --import tsx scripts/golden/run.ts compare ./candidate-golden-adapter
```

For each case the runner starts the candidate command, writes one JSON request
to stdin and expects one JSON outcome on stdout. No diagnostic text may be
written to stdout; stderr is available for diagnostics. Candidate outcomes are
validated strictly: extra properties, ambiguous success/error shapes,
non-string error fields and non-finite values fail the case as
`CANDIDATE_INVALID_OUTPUT`.

Request:

```json
{
  "protocolVersion": 1,
  "caseId": "dates.leap-day",
  "operation": "date.parseCalendarDate",
  "input": { "value": "2024-02-29" }
}
```

Successful and rejected outcomes:

```json
{ "ok": true, "value": { "iso": "2024-02-29T00:00:00.000Z" } }
{ "ok": false, "error": { "code": "INVALID_CALENDAR_DATE" } }
```

The process-per-case protocol favors isolation and portability over speed. A
future Kotlin candidate can expose a tiny `main` that reads the request with
Jackson, invokes its application adapter and writes the normalized outcome.

`expected` is the shared/default outcome. `expectedByAdapter.legacy` and
`expectedByAdapter.candidate` override it only for an intentional migration
difference. The current fixtures use this for JavaScript binary-float rounding
and the unsafe legacy choice of a future cached FX rate. Their shared `expected`
values implement the accepted target rules from
[ADR 001](../../docs/architecture/adr/001-domain-semantics.md): exact decimal
`HALF_EVEN` and quotes whose effective date is not later than the business date.

## Coverage boundary

The suites cover:

- exact/equal/percentage splits, request-order permutations, conservation,
  minimum/maximum values, FX largest-remainder allocation and `HALF_EVEN` drift;
- identity/direct/cross FX, dated quote ordering, future-quote rejection and
  the 14-day cutoff;
- raw positions, int64 aggregates, deterministic debt simplification,
  settlement authorization and exact limits;
- expense edit/delete permissions, inactive-member rollback, create-only cash
  payments, manual-settlement reset scope and invite reactivation/idempotency;
- strict calendar syntax, century leap years, invalid month/day values and
  dates that coincide with DST transitions in different zones;
- latest effective revisions, void/archive behavior, per-currency current and
  all-time totals, achievement thresholds and irreversible unlocks;
- transport defaults/normalization/unknown-field stripping, the complete
  public service-error matrix, auth claim projection and bcrypt UTF-8 limits.

The runner prints field-level JSON paths for every mismatch so a nested amount,
ordering, missing field or accidental data leak is visible immediately. These
fixtures do not replace database concurrency, migration, HTTP contract or
end-to-end tests.
