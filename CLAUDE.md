# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start local dev server
npm run build        # production build
npm run db:generate  # regenerate Prisma client after schema changes
npm run db:migrate   # run migrations in dev (creates migration files)
npm run db:seed      # seed demo data (Alice/Bob/Carol, shared apartment group)
npm run db:studio    # open Prisma Studio GUI
npm run db:reset     # drop and recreate DB, re-run all migrations + seed
npm run setup        # full bootstrap: install + generate + migrate + seed
```

There are no lint or test scripts. TypeScript checking: `npx tsc --noEmit`.

Local Postgres runs on port **5433** (not 5432) via `docker-compose up -d`.

Required env vars in `.env.local`: `DATABASE_URL`, `NEXTAUTH_SECRET` / `AUTH_SECRET`, `NEXTAUTH_URL`, `AUTH_TRUST_HOST=true`.

## Architecture

Next.js 15 App Router monorepo. All backend logic lives in API routes under `/src/app/api/v1/`. No separate server process.

**Request flow:**
```
Browser (React + TanStack Query)
  → fetch /api/v1/…
  → API route (Zod parse + auth() session guard)
  → Service layer (/src/services/*.service.ts)  ← all business logic here
  → Prisma client (/src/lib/db.ts)
  → PostgreSQL
```

**Route groups:**
- `(auth)/` — login/register pages, no sidebar
- `(dashboard)/` — all authenticated pages, rendered inside sidebar + mobile nav layout

**Services** are the authoritative business layer. API routes are thin: parse, auth-check, call service, return response. Never put business logic in API routes or components.

**Error handling:** services throw `Error("DOMAIN_CODE")` strings (e.g. `"EXPENSE_NOT_FOUND"`, `"UNAUTHORIZED"`). `handleServiceError()` in `/src/lib/api-errors.ts` maps these to HTTP status codes and Russian user-facing messages.

**Activity logging:** every mutating operation (expense create/update/delete, settlement, member add/remove, group rename) is logged via Prisma in the same transaction. Don't skip this when adding new mutations — look at any existing service for the pattern.

## Key Domain Concepts

**Money is stored as integers (kopecks/cents)** — no floating-point arithmetic anywhere in DB or business logic. `formatMoney()` in `/src/lib/utils/format.ts` handles display formatting.

**Dual-currency storage:** every `Expense` stores both `amount`/`currency` (original) and `amountBase` (converted to group's settlement currency via CBR rate on expense date). The balance calculator always works in `amountBase`. When creating or updating expenses, you must compute and store `amountBase` via `exchange.service.ts`.

**Exchange rates:** fetched from CBR XML feed on first use for a (date, currency) pair, cached in the `exchange_rates` table. `getRateToRub`, `convertToRub`, `convertBetween` in `exchange.service.ts`. `BASE_CURRENCY = "RUB"` — all conversions go through RUB.

**Balance calculation** (`/src/lib/utils/balance-calculator.ts`): greedy O(n log n) debt simplification — builds net positions from all expenses and settlements, then greedily pairs largest creditors and debtors to minimize transfer count. This is pure computation with no DB access; it receives pre-fetched data.

**Split modes:** EQUAL, EXACT, PERCENTAGE. All split math lives in `/src/lib/utils/split-calculator.ts`. Zod validation in `/src/lib/validations/expense.ts` enforces percentage sum = 100%, etc.

**Cash-on-spot payments:** an expense can have inline cash payments (`cashPayments`) where the payer marks certain participants as already settled. These are stored as part of the expense split data.

## Data Model Highlights

- `GroupMember` has a `defaultRate` (exchange rate at time of member's first expense) and `paymentRequisites` (freeform text shown in settlement dialog).
- `ExpenseSplit` stores `amount` (share in expense currency) and `amountBase` (in settlement currency) per participant.
- `Settlement` records a debt payoff between two members, always in the group's settlement currency.
- `GroupInvite` holds a UUID token for shareable invite links; admin can revoke.
- `Friendship` is created implicitly when two users share a group.

## Frontend Conventions

**TanStack Query** is the client state layer. Query keys: `["group", id]`, `["expenses", id]`, `["balances", id]`, `["overview"]`. Mutations call `queryClient.invalidateQueries(...)` on success — always invalidate all affected keys.

**Forms** use `react-hook-form` + Zod resolvers. The shared Zod schemas in `/src/lib/validations/` are used on both client and server side.

**UI components** in `/src/components/ui/` follow the Shadcn/CVA pattern: `class-variance-authority` for variants, `cn()` from `/src/lib/utils.ts` for conditional class merging.

**`@/*` path alias** maps to `./src/*`.
