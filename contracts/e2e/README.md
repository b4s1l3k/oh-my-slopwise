# E2E fixture adapter contract

The Playwright suite can run unchanged against either the legacy Next.js
backend or a replacement stack. A candidate stack owns its database lifecycle;
Playwright never imports its ORM or runs its migrations.

Set `E2E_BASE_URL` to the externally running web application and
`E2E_FIXTURE_ADAPTER` to an executable file, then run:

```bash
E2E_BASE_URL=http://127.0.0.1:4100 \
E2E_FIXTURE_ADAPTER=./backend/build/install/e2e-fixtures/bin/e2e-fixtures \
npm run test:e2e:candidate
```

Before browser tests, the runner writes one `reset-and-seed` JSON request to
the adapter's stdin. The adapter must reset only its isolated test storage,
create the supplied identities and write exactly one response to stdout:

```json
{ "protocolVersion": 1, "ok": true }
```

Diagnostics belong on stderr. A non-zero exit code, timeout, invalid JSON,
wrong protocol version or `{ "ok": false }` fails the suite before the first
browser action. The complete request/response definition is
`fixture-protocol.schema.json`.

Without candidate variables, `e2e/support/legacy-prisma-fixture.ts` is selected
as the replaceable legacy adapter. It is the only part of the Playwright setup
that knows Prisma or the legacy migration command.
