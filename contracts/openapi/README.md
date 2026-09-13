# `/api/v1` behavioral contract

`v1.openapi.json` is the canonical contract of the HTTP API implemented by the
Next.js route handlers under `src/app/api/v1`. The contract and implementation
are evolved together; existing behavior is changed when doing so makes the API
safer or more consistent.

In particular, v1 keeps:

- the Auth.js cookie session (registration is the only anonymous operation);
- integer monetary amounts in the application's legacy minor-unit convention;
- ISO date-time strings in persisted resource responses and strict
  `YYYY-MM-DD` calendar-date strings in expense and settlement commands;
- page-number expense pagination;
- the three existing error shapes: plain string, Zod `flatten()` and service
  `{ code?, message }` envelopes;
- the legacy response field set, including nullable persistence fields; explicit
  response DTO/mappers now prevent new Prisma fields from leaking automatically.

The contract is the migration boundary for the future backend. Remaining weak
v1 choices can be corrected before the rewrite because the application does not
serve production data or external clients.

## Verification

Run:

```bash
npm run test:contract
```

The contract command verifies OpenAPI/source parity and directly invokes every
route handler with mocked boundaries to pin statuses, complete JSON success
shapes and representative errors. It does not mutate or introspect a live
database.
