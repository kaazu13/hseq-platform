# HSEQ Platform

A multi-tenant construction workforce and HSEQ (Health, Safety, Environment,
Quality) platform built on Next.js 16 (App Router) and Supabase. Tracks
organizations, employees, projects, and teams today, with the HSEQ-specific
modules (inspections, incidents, corrective actions, LMRA, toolbox talks,
certificates) scoped but not yet built — see `docs/PRODUCT_REQUIREMENTS.md`.

## Architecture summary

- **Frontend**: Next.js 16 App Router, React 19 Server Components by
  default, client components only where genuinely interactive (forms,
  dialogs, menus). UI built on shadcn components over Base UI primitives
  (not Radix).
- **Backend**: Supabase Postgres. Row Level Security is the real tenant-
  isolation and authorization boundary — every table enforces its own
  access rules at the database level; application code re-checks the same
  conditions for UX (showing/hiding actions), never as the only gate.
- **Mutations**: Next.js Server Functions (`"use server"`) in each
  `modules/<domain>/actions.ts`, following a fixed recipe (auth check →
  validate → mutate → audit → revalidate) documented in
  `docs/API_CONVENTIONS.md`.
- **Multi-tenancy**: every tenant-owned table traces back to
  `organizations`; a person can belong to multiple organizations via
  `organization_memberships`, each with its own role assignments.

For the full picture, see `docs/ARCHITECTURE.md`.

## Prerequisites

- Node.js 20+ and npm
- A Supabase project (for connecting to a real/remote environment) — see
  [Environment setup](#environment-setup)
- [Docker](https://docs.docker.com/desktop) — **required** for local
  Supabase (`supabase start`) and therefore for the database and
  integration test suites (see [Test commands](#test-commands)). Not
  required for `npm run dev`/`build`/`lint`/`test:unit` against a remote
  Supabase project.

## Environment setup

Copy `.env.local.example` to `.env.local` and fill in your Supabase
project's values (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; `SUPABASE_SECRET_KEY` only if you're
running a trusted server-only script — see that file's comments for the
full secrets policy, also documented in `docs/ARCHITECTURE.md` §7).

```bash
cp .env.local.example .env.local
npm install
npm run dev
```

`.env.local` (and every `.env*` file except the `*.example` templates) is
git-ignored — never commit real credentials.

## Local Supabase setup

Local Supabase (via the Supabase CLI, already a dev dependency) gives you a
disposable Postgres + Auth + Studio stack on your machine — required for
the database and integration test suites, and generally the safest way to
try schema changes before touching a shared project.

```bash
npx supabase start
```

This prints your local API URL, anon/publishable key, and service-role
key. Copy `.env.test.local.example` to `.env.test.local` and fill in those
local values — see that file's comments; **these must be your local
instance's values, never a remote project's.**

```bash
cp .env.test.local.example .env.test.local
```

To reset the local database to a clean state (re-applies every migration
plus `supabase/seed.sql`):

```bash
npx supabase db reset
```

## Migration workflow

Migrations live in `supabase/migrations/`, one file per change, named
`<timestamp>_<description>.sql`. Once a migration has been applied to a
shared environment it is never edited — a correction is always a new file.

```bash
npx supabase db push --dry-run   # preview what would apply to the linked remote project
npx supabase db push             # apply
npx supabase migration list      # confirm local and remote match
```

See `docs/DATABASE_SCHEMA.md` for the schema itself and
`docs/API_CONVENTIONS.md` §6 for how RLS, triggers, and application code
divide responsibility.

## Seed workflow

`supabase/seed.sql` (the role catalogue + one example organization) runs
automatically on `supabase db reset`/`supabase start`.

For a fuller, realistic multi-role test organization (useful for manually
exercising the app as different kinds of users), `scripts/seed-test-org.ts`
creates an idempotent, clearly-named "Northstar Scaffolding Test AB"
organization with a full staff, two projects, and four teams — safe to
re-run, never touches any other organization. `scripts/cleanup-test-org.ts`
removes it again. Both require `SUPABASE_SECRET_KEY` in `.env.local`.

```bash
npm run seed:test-org
npm run cleanup:test-org
```

## Test commands

> **Local Supabase only.** `test:db` and `test:integration` must never run
> against a remote/hosted Supabase project — both refuse to start at all
> unless the target host is `127.0.0.1`/`localhost` (see
> `tests/db/helpers.ts` and `tests/integration/helpers.ts`). Run
> `npx supabase start` first and fill in `.env.test.local` (see
> [Local Supabase setup](#local-supabase-setup)).

| Command | What it runs | Needs local Supabase? |
|---|---|---|
| `npm test` | Alias for `test:unit` | No |
| `npm run test:unit` | Pure-function unit tests (`lib/`, `modules/*/permissions.ts`) | No |
| `npm run test:db` | Database/RLS tests (`tests/db/`) — cross-org isolation, role permissions, employment invariants, project/team invariants | **Yes** |
| `npm run test:integration` | Server Action integration tests (`tests/integration/`) — a small representative set exercising real actions against real Supabase | **Yes** |

`test:unit` is always safe to run anywhere (CI included) with zero setup.
`test:db`/`test:integration` are the ones that need Docker.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system design, module
  boundaries, secrets policy
- [`docs/API_CONVENTIONS.md`](docs/API_CONVENTIONS.md) — Server Function
  recipe, validation, RLS/app-layer division of responsibility
- [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) — full schema
  reference
- [`docs/ROLES_AND_PERMISSIONS.md`](docs/ROLES_AND_PERMISSIONS.md) — the
  role catalogue and access matrix
- [`docs/UI_GUIDELINES.md`](docs/UI_GUIDELINES.md) — UI conventions and
  shared components
- [`docs/PRODUCT_REQUIREMENTS.md`](docs/PRODUCT_REQUIREMENTS.md) — product
  scope, what's built vs. planned
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — milestone
  history

## Other scripts

```bash
npm run lint     # ESLint
npm run build    # production build
npm run start    # run a production build locally
```
