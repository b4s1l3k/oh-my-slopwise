# Repository guidance

## Commands

```bash
npm run dev                 # Next.js development server
npm run build               # production build
npm run db:generate         # regenerate Prisma Client
npm run db:migrate          # create a development migration
npm run db:deploy           # apply existing migrations
npm run db:reset            # reset a local/test database; no seed is run
npm run db:studio           # Prisma Studio
npm run setup               # npm ci, generate and deploy migrations
npm run typecheck
npm test
npm run test:db
npm run test:coverage
npm run test:contract
npm run test:golden
npm run test:e2e:production
```

Local PostgreSQL runs on port 5433 through `docker compose up -d db`. Copy
`.env.example` to `.env`; both Prisma CLI and Next.js read it.
There is no demo seed. The single migration in `prisma/migrations` is a
fresh-install baseline and creates no users or application data.

DB tests use only `TEST_DATABASE_URL`; its database name must contain a
standalone `test` marker and must differ from `DATABASE_URL`. The test runner
applies migrations and disables file parallelism for transaction-sensitive
integration tests.

## Architecture

The current system is a Next.js 15 application with PostgreSQL:

```text
browser -> TanStack Query hook -> typed API client -> /api/v1 route
        -> application service -> Prisma -> PostgreSQL
```

Routes and components stay thin. Business rules belong in `src/services` or
pure domain helpers. Transport DTOs are generated from OpenAPI and mapped to
frontend view models. Monetary amounts use integer minor units; `amountBase` is
expressed in the group settlement currency. Ledger facts remain authoritative,
while balance and lifetime-statistics projections are transactionally
maintained and rebuildable.

The detailed current and target architecture is maintained in
`docs/architecture`. OpenAPI, golden fixtures and E2E fixture adapters are the
migration boundary for a future backend and must remain independent of Prisma.
