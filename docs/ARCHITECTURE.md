# Architecture

## 1. Technology Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) | Currently on Next.js 16.x. **Next.js 16 renamed `middleware.ts` to `proxy.ts`** and introduced the `forbidden()` / `unauthorized()` navigation helpers — this document uses the current names throughout. Do not follow older Next.js tutorials that reference `middleware.ts` or "Server Actions" without checking against `node_modules/next/dist/docs` first. |
| Language | TypeScript, `strict: true` | No `any` in new code; shared types live in `/types` or colocated `*.types.ts` files. |
| Styling | Tailwind CSS v4 (CSS-first `@theme`, already configured in `app/globals.css`) | No `tailwind.config.js` — theme tokens are defined via CSS `@theme`. |
| UI components | shadcn/ui | Copied into the repo (not an npm dependency in the traditional sense) — see [UI_GUIDELINES.md](./UI_GUIDELINES.md). Not yet installed as of this document. |
| Database | Supabase PostgreSQL | Single Postgres instance, tenant isolation via `organization_id` + Row Level Security, not separate databases/schemas per tenant. |
| Auth | Supabase Authentication | Email/password + magic link at minimum; SSO is a future option. Supabase issues the session; Next.js reads it server-side. A **Custom Access Token Auth Hook** is required for the multi-organization model — see [§3.2](#32-organization-membership-model). |
| Data access control | Supabase Row Level Security (RLS) | The database — not application code — is the last line of defense for tenant isolation. |
| Hosting | Vercel | Next.js app. Supabase is hosted separately (Supabase Cloud). |

## 2. Guiding Principles

1. **The database enforces tenancy, not just the application.** RLS policies must make it structurally impossible for a query to return another organization's rows, even if application code has a bug.
2. **Authorization is decided on the server.** Client-side role checks are UX only (hide a button); every mutation and every sensitive read is re-checked server-side (RLS + server action authorization). See [API_CONVENTIONS.md](./API_CONVENTIONS.md#6-server-side-authorization).
3. **Everything is attributable.** Tenant-owned records carry `created_by` / `updated_by`, and mutations to HSEQ-relevant data additionally emit an audit log entry.
4. **HSEQ records are evidence.** They are not hard-deleted; correcting a mistake is a new, linked record or a fully audit-logged update, never a silent overwrite or a `DELETE`. Audit log entries and completed digital signatures go further — they are never edited or deleted by anyone, at the database level, once written. See [§8](#8-audit-logging) and [§10](#10-file-storage-attachments-photos-signatures).
5. **Mobile is the primary surface for field roles.** Supervisor/Inspector/Employee flows are designed at phone width first; desktop is an enhancement, not the baseline.
6. **A reference to another record is only as trustworthy as its validation.** Any column that points at another row — a real foreign key to `profiles`, or a polymorphic `entity_type`/`entity_id` pair — must be validated server-side at write time: does the referenced row exist, does its effective organization match this record's organization (or is it a legitimate cross-org/global reference, like a system category), and is the acting user actually permitted to reference it. This matters more than it used to now that `profiles` is a global table (see [§3.2](#32-organization-membership-model)) — a foreign key to `profiles(id)` no longer implies "this person is in my organization" by itself. See [§3.4](#34-cross-reference-validation-rule) and [API_CONVENTIONS.md §6](./API_CONVENTIONS.md#6-server-side-authorization).
7. **Avoid unnecessary complexity.** No microservices, no separate per-tenant databases, no client-side global state library unless a concrete need appears — App Router server components plus a thin client layer is sufficient for this product's shape.

## 3. Multi-Tenancy Model

### 3.1 Tenant boundary

- `organizations` is the tenant root table.
- Every tenant-owned table carries a non-nullable `organization_id uuid references organizations(id)`.
- A small number of tables are intentionally **not** tenant-owned: `profiles` (global user identity, see [§3.2](#32-organization-membership-model)), the `platform_super_admins` allow-list, and any future platform-level configuration.
- **Platform Super Admin access does not depend on ordinary tenant membership.** A Platform Super Admin is identified solely by a row in `platform_super_admins` keyed on their `auth.users` id — they do not need (and by default do not have) an `organization_memberships` row in any tenant to perform platform-level operations like creating a new organization or its first Company Admin. This is enforced by a dedicated `is_platform_super_admin()` RLS helper that never consults `organization_memberships`, kept structurally separate from the `current_org_id()` / `current_role_ids()` helpers used for ordinary tenant access. See [DATABASE_SCHEMA.md §8](./DATABASE_SCHEMA.md#8-row-level-security-approach).

### 3.2 Organization Membership Model

**v1 uses a multi-organization-capable model from the start.** A person's identity is separate from their relationship to any given organization:

- **`profiles`** — one row per Supabase Auth user, **identity information only**: name, phone, and a `active_organization_id` preference (see [Active organization selection](#active-organization-selection) below). No `organization_id`, no `role`, no per-org status live here — `profiles` is a global table, not a tenant-owned one.
- **`organizations`** — the tenant root, as before.
- **`organization_memberships`** — connects a `profiles` row to an `organizations` row. Each membership has its own **status**: `invited`, `active`, `suspended`, or `removed`. A person can hold at most one membership row per organization, and any number of memberships across different organizations.
- **`membership_roles`** — a membership can carry **more than one role** (see [§6](#6-authorization-model)); this is a separate table, not a single `role` column, specifically so a person can be e.g. both Supervisor and Inspector within the same organization.

This directly replaces the earlier single-org, single-role design (`profiles.organization_id` + `profiles.role`) that an earlier version of this document proposed. See [DATABASE_SCHEMA.md §3](./DATABASE_SCHEMA.md#3-core-tables) for the exact table shapes. **All four tables/relationships above are implemented** (`profiles`, `organizations`, `organization_memberships`, `membership_roles` — the last as a `role_id` FK into a `roles` table rather than a raw `role` column; see [DATABASE_SCHEMA.md — Implementation Status](./DATABASE_SCHEMA.md#implementation-status)).

#### Active organization selection

**Not implemented.** Everything in this subsection — the Custom Access Token Auth Hook, the `org_id` JWT claim, `current_org_id()`, `switchActiveOrganization()` — is the originally-proposed design, preserved here as a future direction, not what exists today. `profiles.active_organization_id` **is** implemented, but only as an inert UX-preference column (per its own description below) with no code yet reading or writing it.

What's implemented instead: every authorization check takes an explicit organization id rather than resolving one "active" organization implicitly. `lib/auth/session.ts` exposes `requireOrganizationMembership(organizationId)` and `requireRole(organizationId, roleName)`, both delegating to SQL functions (`is_organization_member`, `has_organization_role` — see [DATABASE_SCHEMA.md §8.1](./DATABASE_SCHEMA.md#81-as-implemented-this-milestone)) that check membership/role **per call, per organization** — there is no single cached "current org" anywhere server-side. This fully satisfies §3.3's isolation guarantees without needing the Auth Hook; what the hook would add on top is ergonomics (not passing an org id through every call), not security.

A user's UI and every server-side authorization decision is scoped to one **active organization** at a time, even if they belong to several. Selecting/switching is explicit, not inferred per-request:

1. `profiles.active_organization_id` stores the user's current preference — a plain pointer, **not itself a security decision**. It only exists so the app knows which organization to default into on login.
2. A **Supabase Custom Access Token Auth Hook** (a Postgres function configured at the Supabase project level) runs whenever a session token is issued or refreshed. It reads `profiles.active_organization_id` for the signed-in user, checks it against an **active** row in `organization_memberships`, and embeds the result as an `org_id` claim in the JWT (falling back to the user's first active membership, or omitting the claim entirely if they have none).
3. The RLS helper `current_org_id()` reads the `org_id` claim from `auth.jwt()` **and re-validates it live** against `organization_memberships` (status = `active`) before trusting it — so a stale token (e.g., issued before a membership was suspended) can never grant access it shouldn't. See [DATABASE_SCHEMA.md §8](./DATABASE_SCHEMA.md#8-row-level-security-approach) for the exact function.
4. Switching organizations is a Server Function, `switchActiveOrganization(organizationId)`: it verifies the caller has an active membership in the target organization, updates `profiles.active_organization_id`, and triggers a client-side session refresh (`supabase.auth.refreshSession()`) so the hook re-runs and the JWT's `org_id` claim updates. The UI then reflects the new active organization on the next request.
5. Listing "which organizations do I belong to" (to render an organization switcher) is necessarily a query that is **not** scoped to the current active organization — `organization_memberships` therefore carries an additional RLS policy letting a user read their **own** membership rows (any organization, any status) regardless of which organization is currently active, layered on top of the standard tenant-scoped policy that lets org admins see other members' rows within the active organization. Same treatment for reading basic `organizations` info (name, status) for any org the user has a membership in.

This means: setting up the multi-org switcher is not purely an application-code task — it requires configuring the Custom Access Token Hook in the Supabase project (Dashboard or a migration-managed Postgres function + Auth config), which is called out explicitly as a setup step in [IMPLEMENTATION_PLAN.md — M2](./IMPLEMENTATION_PLAN.md#m2--core-schema--tenant-isolation-rls-foundation).

### 3.3 How isolation is enforced (defense in depth)

1. **RLS policies** on every tenant-owned table restrict `SELECT`/`INSERT`/`UPDATE`/`DELETE` to rows whose `organization_id` the caller has a validated membership in — as implemented, via `is_organization_member(organization_id)`/`has_organization_role(organization_id, role_name)` checked per row (see [DATABASE_SCHEMA.md §8.1](./DATABASE_SCHEMA.md#81-as-implemented-this-milestone)); the originally-proposed single active-organization claim (`current_org_id()`, [§3.2](#32-organization-membership-model)) is a documented future enhancement, not what's built. Never a client-supplied value either way.
2. **Server-side authorization** in Server Functions / Route Handlers re-derives the caller's organization membership and role(s) from the authenticated session for whichever organization the operation targets — never trusts an `organization_id` or `role` passed from the client.
3. **No service-role key on the client, ever.** The Supabase service role (which bypasses RLS) is only used in trusted server-only contexts (e.g., a platform admin operation, or a scheduled job) and is never sent to the browser. See [Secrets and environment variables](#7-secrets-and-environment-variables).

### 3.4 Cross-Reference Validation Rule

Because `profiles` is global (not scoped to one organization), a foreign key from a tenant table to `profiles(id)` — `assigned_to`, `approved_by`, `conducted_by`, `reported_by`, `signer_id`, `project_manager_id`, and similarly-shaped columns throughout [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) — only guarantees the referenced person exists, **not** that they are a member (let alone a member with an appropriate role) of the organization the record belongs to. The same is true, for a different reason, of the polymorphic `entity_type`/`entity_id` pairs used by `attachments`, `digital_signatures`, and `corrective_actions.source_type`/`source_id` (these have no database-level FK at all).

Every Server Function that writes one of these references must therefore validate, server-side, before the write:

1. **Existence** — the referenced row actually exists.
2. **Organization match** — for a `profiles` reference, the referenced person has an **active** `organization_memberships` row for this record's `organization_id`; for a polymorphic reference, the referenced row's own `organization_id` equals this record's `organization_id` (or the reference is to a legitimate global/system row, such as a system-defined `event_categories` entry, which is exempt from the org-match check by design).
3. **Permission** — the acting user is actually allowed to reference that row in this way (e.g., a Supervisor can only assign a corrective action to someone with an active membership in the same organization, not merely any valid `profiles.id` in the database).

This is one rule applied in several places, not a special case per table — see [DATABASE_SCHEMA.md — Polymorphic references](./DATABASE_SCHEMA.md#polymorphic-references-corrective_actionssource_id-attachmentsentity_id-digital_signaturesentity_id) and [API_CONVENTIONS.md §6](./API_CONVENTIONS.md#6-server-side-authorization).

## 4. Application Structure (module-based)

Proposed top-level layout as the app grows beyond the current scaffold (`app/layout.tsx`, `app/page.tsx`):

```
supabase/                       # built — Supabase CLI project (supabase init), not linked to any remote project
  config.toml
  migrations/                   # built — 10 SQL files, ordered; see the database-foundation milestone's implementation report
  seed.sql                      # built — dev-only: seeds the role catalogue + one example organization

proxy.ts                        # project root, sibling of app/ — NOT inside app/. This is a Next.js file-
                                 # convention requirement, unlike everything else in this tree, which is just
                                 # this project's own organization. Formerly "middleware.ts".

app/
  (marketing)/                 # public/unauthenticated routes
    login/
      page.tsx                 # built — Server Component, redirects to /dashboard if already signed in
      login-form.tsx           # built — Client Component (needs pending/error state)
    accept-invite/             # completes an invited membership (sets password, joins the org) — not public self-registration
  (platform)/                  # platform super-admin only, separate from tenant app shell
    admin/
      organizations/           # PSA-only: create/suspend organizations, provision first Company Admin
  (app)/                       # authenticated, tenant-scoped app shell
    layout.tsx                 # built — calls requireUser(); full org/role-aware shell (nav, org name in header) deferred
    select-organization/       # organization switcher, shown when a user has >1 membership or none active — deferred, needs the Auth Hook (§3.2)
    dashboard/
      page.tsx                 # built — lists the signed-in user's active organization memberships; empty state if none
    projects/
      [projectId]/
        locations/
        schedule/
    timesheets/
    hour-discrepancies/
    employees/
      [employeeId]/
        documents/
    hseq/
      lmra/
      toolbox-talks/
      scaffold-inspections/
      safety-walks/
      corrective-actions/
      incidents/
      near-misses/
      observations/
    reports/
    settings/
      organization/
      users/                   # manage organization_memberships + membership_roles for the active org
  unauthorized.tsx             # built — rendered when unauthorized() is called (401)
  forbidden.tsx                 # built — rendered when forbidden() is called (403)

modules/                        # feature/domain logic, framework-agnostic where possible
  auth/                         # built — login()/logout() Server Functions + shared zod schema
    actions.ts
    validation.ts
  projects/
    queries.ts                 # server-only data access for this domain
    actions.ts                 # 'use server' Server Functions (mutations)
    types.ts
    permissions.ts             # who can do what, for this domain
  timesheets/
  hseq/
    incidents/
    inspections/
    corrective-actions/
    event-categories/          # configurable incident/observation classification
    ...
  organizations/                # built — types.ts (Organization/Profile/.../RoleName aliases), queries.ts (listActiveOrganizationsForUser)
    memberships.ts              # not built — invite/suspend/remove + active-org switching logic (needs the (app)/settings/users UI and, for switching, the Auth Hook)
  employees/
  notifications/
  audit-log/

lib/
  supabase/
    server.ts                  # built — server-side Supabase client (reads cookies), typed against types/database.ts
    client.ts                  # built — browser Supabase client (publishable key only), typed against types/database.ts
    middleware.ts              # built — updateSession(), called from proxy.ts
    admin.ts                   # secret-key client — server-only, added when first needed (not built yet)
  auth/
    session.ts                 # built — requireUser(), getCurrentUser(), requireOrganizationMembership(organizationId), requireRole(organizationId, roleName)
  action-result.ts             # built — shared ActionResult<T>/ActionErrorCode types (docs/API_CONVENTIONS.md §4)
  validation/                  # shared zod schemas used by forms + Server Functions (auth's schema currently lives in modules/auth/validation.ts instead — see note below)

components/
  ui/                          # shadcn/ui primitives
  shared/                      # cross-module composed components (data table, page header, org switcher, etc.)

types/
  database.ts                  # built, but HAND-WRITTEN, not generated — no Supabase project is linked yet to run
                                # `supabase gen types typescript` against. Mirrors the real generated shape closely
                                # enough to be a drop-in replacement once one is. See that file's own header comment.
```

Rationale:
- `modules/*` holds domain logic (queries, mutations, permission rules, types) independent of routing, so a given domain's logic isn't scattered across every route that touches it.
- Route folders under `app/(app)/*` stay thin: they call into `modules/*` and render.
- This structure scales by adding a new module folder + route segment, without needing a framework change, satisfying "scalable module-based folder structure" without introducing an unnecessary layered architecture (no repository/service/controller ceremony beyond what's listed above).

**Build status (as of the database-foundation milestone)**: everything marked "built" above exists and is wired together end-to-end (build passes, routes are gated correctly, the dashboard reads real `organization_memberships`/`organizations` rows through RLS). Everything else in this tree — every business module, `select-organization/`, the `(platform)/` admin area, `lib/supabase/admin.ts`, `modules/organizations/memberships.ts`, and active-organization JWT-claim resolution anywhere — is still just this proposed layout, not yet implemented; see [DATABASE_SCHEMA.md — Implementation Status](./DATABASE_SCHEMA.md#implementation-status) for the database side of the same picture. `modules/auth/validation.ts` was used instead of the shared `lib/validation/` folder shown above because, at the time it was written, auth was the only Server Function that existed and a shared folder for one file would have been premature; revisit once a second module needs a `zod` schema.

## 5. Authentication & Session Handling

- Supabase Auth issues the session; the Next.js app reads/refreshes it via `@supabase/ssr` cookie-based helpers (server client in `lib/supabase/server.ts`, browser client in `lib/supabase/client.ts`).
- `proxy.ts` (the Next.js 16 successor to `middleware.ts`) is responsible only for **refreshing the Supabase session cookie** on navigations and redirecting unauthenticated users away from `(app)` and `(platform)` routes. Per current Next.js guidance, Proxy is a coarse, last-resort gate — it must not be the *only* authorization check. Every Server Function and Route Handler re-verifies the session, active organization, and role(s) itself, since a Proxy matcher misconfiguration or a Server Function invoked directly must not silently skip authorization.
- `requireUser()` (in `lib/auth/session.ts`) resolves the authenticated user **and** their validated active organization (`current_org_id()`, per [§3.2](#32-organization-membership-model)); if the user has no active organization (no memberships, or their active pick is no longer valid), it routes them to `select-organization` rather than into the app shell.
- Fine-grained "is this user allowed to do X" checks happen in:
  - RLS policies (data-level).
  - `lib/auth/session.ts` helpers (`requireUser()`, `requireRole([...])` — checking the **union** of the user's roles for the active organization) called at the top of Server Functions/Route Handlers/Server Components (action-level).
- Unauthorized/forbidden UX uses the Next.js file conventions: call `unauthorized()` from `next/navigation` for "not signed in" (renders `app/unauthorized.tsx`, HTTP 401) and `forbidden()` for "signed in but not permitted" (renders `app/forbidden.tsx`, HTTP 403), rather than ad hoc redirects, so the behavior is consistent and testable across the app.

## 6. Authorization Model

- **A user may hold multiple roles within the same organization.** Roles are assigned per membership via `membership_roles` (see [§3.2](#32-organization-membership-model) and [ROLES_AND_PERMISSIONS.md](./ROLES_AND_PERMISSIONS.md)) — not a single `role` column.
- **Permissions are the union of the membership's assigned roles.** If any role the user holds in their active organization grants a capability, they have it. There is no "most restrictive role wins" behavior — holding an additional narrow role never takes away something a broader role already grants.
- **Explicit restrictions take precedence over the union.** A small set of system-level rules are hard denies regardless of role — no one edits or deletes an audit log row or a completed digital signature; no one accesses another organization's data; a handful of module-specific carve-outs noted in the permission matrix (e.g., a Supervisor's corrective-action management still requires HSEQ Manager sign-off to fully close certain items). These are implemented as checks that run *before*, and can override, the role-union check — see [ROLES_AND_PERMISSIONS.md §6](./ROLES_AND_PERMISSIONS.md#6-notes-on-enforcement).
- Permission checks are centralized per module in `modules/<domain>/permissions.ts` (e.g., `canApproveTimesheet(roles, record)`, taking the caller's full role set) rather than scattered `if (role === 'x')` checks, so a permission rule has one place to change. **Not implemented yet** — no business module (and therefore no `permissions.ts`) exists. What *is* implemented, in `lib/auth/session.ts`: `requireRole(organizationId, roleName)`, which checks for one named role at a time (matching `has_organization_role()`'s signature — see below), not yet a resolved "full role set" a caller can union over. A future `permissions.ts` layer composes calls like this (or a new `getRoles(organizationId)` helper returning the full set) into the real union logic described above.
- The permission matrix in [ROLES_AND_PERMISSIONS.md](./ROLES_AND_PERMISSIONS.md) is the source of truth these functions implement; server-side authorization and RLS should both be traceable back to it. **As implemented**, both `requireRole()` and the RLS policies that need a role check call `has_organization_role(organization_id, role_name)` directly (see [DATABASE_SCHEMA.md §8.1](./DATABASE_SCHEMA.md#81-as-implemented-this-milestone)) — the originally-proposed `current_role_ids() && ARRAY[...]` array-overlap pattern is part of the not-yet-built active-organization design ([DATABASE_SCHEMA.md §8.2](./DATABASE_SCHEMA.md#82-original-design-future-enhancement-not-yet-built)).

## 7. Secrets and Environment Variables

| Variable | Exposed to client? | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Project URL, safe to expose. **No trailing path** (not `/rest/v1/`, `/auth/v1/`, etc.) — the client libraries append the correct path themselves; a URL with a path suffix breaks every request. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase's current key naming (`sb_publishable_...`), superseding the legacy "anon key" terminology this document originally used. Safe to expose — RLS is what actually protects data, not secrecy of this key. If a project still issues a legacy anon JWT instead, the same variable name and treatment apply. |
| `SUPABASE_SECRET_KEY` | **No** | Supabase's current name for the key that bypasses RLS (supersedes the legacy "service role key" terminology). Server-only (Vercel server environment). Never imported into any file that can end up in a client bundle. Used only for narrowly-scoped trusted operations (e.g., platform admin provisioning, scheduled jobs). Not required until such an operation exists — not used anywhere in the M1/M3 auth foundation. |
| `SUPABASE_JWT_SECRET` (if needed) | **No** | Only if verifying JWTs outside Supabase's own SDK. |

Rules:
- Anything without the `NEXT_PUBLIC_` prefix must never be referenced from a Client Component or from code that a Client Component imports.
- `lib/supabase/admin.ts` (secret-key client, added when a trusted server-only operation first needs it) must only be imported from server-only files (Route Handlers, Server Functions, scripts) — enforced with the `server-only` package import guard (installed; already used by `lib/supabase/server.ts` and `lib/auth/session.ts`).
- No API keys, tokens, or secrets are ever committed to the repo; `.env.local` is git-ignored (already the case per the current `.gitignore`).

## 8. Audit Logging

- A single `audit_events` table (see [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md#audit_events--tenant-append-only--implemented) — **implemented**, named `audit_logs` in an earlier revision of that document) captures: `organization_id`, `actor_user_id`, `action` (e.g., `create`, `update`, `delete`, `approve`, `sign`, `amend`), `entity_type`, `entity_id`, a `changes` JSON diff where practical, and `created_at`.
- Audit logging is written from the server-side mutation path (Server Function / Route Handler), not inferred later from Postgres triggers — this keeps the "who" (application-level actor, already authenticated and authorized) explicit and avoids trigger-level complexity for a first version. This can be revisited if we find mutation paths bypassing the shared helper. (This is about *writing* audit rows. A *separate*, already-implemented trigger *blocks* `UPDATE`/`DELETE` on existing `audit_events` rows — see the next bullet — which is not in tension with this one.)
- HSEQ modules and any approval/sign-off action (timesheet approval, hour discrepancy resolution, corrective action closure, digital signature capture) always write an audit entry. Simple read-only views do not.
- **`audit_events` is append-only and immutable**: no `UPDATE`/`DELETE` RLS policy is granted to any application role, including Company Admin, for any reason — enforced twice over, as implemented: RLS grants no such policy, **and** a hard database trigger unconditionally rejects both operations for every role, including ones (`service_role`, `postgres`) that bypass RLS entirely.
- **Digital signature records are immutable in the same way** — once written, a `digital_signatures` row is never updated or deleted (see [§10](#10-file-storage-attachments-photos-signatures)). Not yet implemented (that table doesn't exist yet — see [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for what's built so far).
- **Corrections to finalized evidence are new records, not edits.** Once an HSEQ record has been finalized (e.g., an incident closed, an inspection submitted, a signature captured), a substantive correction is modeled as a new linked record — an amendment, a follow-up entry, or (for `audit_events`/`digital_signatures` specifically) simply a new row referencing the original — rather than mutating the original's core facts. This preserves the original evidence exactly as it was captured, while `audit_events` still records the full history of what changed and when for records that *are* mutable pre-finalization (e.g., a draft incident report being edited before submission is ordinary editing, fully audit-logged, and not subject to this rule).

## 9. Soft Deletion

- Applies to records with business/legal retention value: employees, projects, all HSEQ records, documents/certificates, timesheets. See per-table "Deletion behavior" in [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md).
- Implemented via `deleted_at timestamptz null` on most tables. `organization_memberships` is the one exception among lifecycle-bearing tables: its own `status` enum (`invited`/`active`/`suspended`/`removed`) already models "no longer a member" as a state, so it does not need a separate `deleted_at` column.
- Default queries filter `deleted_at is null` (or, for `organization_memberships`, `status <> 'removed'`); RLS policies restrict who may set these values (typically Company Admin or the module-owning manager role, never Employee).
- Purely operational/low-stakes records (e.g., a draft not yet submitted, a role grant on `membership_roles`) may use hard deletion where retention has no compliance value — called out explicitly per table rather than assumed.
- Soft-deleted rows are excluded from default reporting but remain visible in audit trails and to Company Admin/Platform Super Admin for compliance review.

## 10. File Storage (Attachments, Photos, Signatures)

- Supabase Storage, one bucket strategy: a private bucket (e.g., `attachments`) with object paths namespaced by `organization_id/entity_type/entity_id/filename`, and Storage RLS policies mirroring the database tenancy rule (a user may only read/write objects under their own active organization's prefix).
- Signed URLs (short-lived) are used for read access from the client rather than making the bucket public, since photos/incident evidence are sensitive.
- **Digital signature captures** are authenticated electronic attestations, not a certified/qualified e-signature product (see [PRODUCT_REQUIREMENTS.md §6.10](./PRODUCT_REQUIREMENTS.md#610-digital-signatures)). Each capture stores: the signer's user id, a **snapshot of the signer's name** at signing time (identity data can change later; the attestation must not), a timestamp, the attestation/statement text accepted, the **version of the document or form** being attested to, and — where legally appropriate for the org's jurisdiction — the signer's IP address and user-agent, alongside either a rendered signature image or vector stroke data in Storage. A `digital_signatures` row is immutable once written (see [§8](#8-audit-logging)). If a customer requires a certified e-signature product, that is a later, separate integration, not an extension of this table.

## 11. API Surface

- Primary mutation path: **Server Functions** (`'use server'`, formerly commonly called "Server Actions") colocated in `modules/<domain>/actions.ts`, invoked directly from forms/Server Components. This is preferred over hand-built Route Handlers for internal app mutations because it keeps request/response typing and CSRF handling inside the framework's own model.
- **Route Handlers** (`app/api/**/route.ts`) are used only where a Server Function doesn't fit: webhooks (e.g., Supabase auth webhooks), file/export downloads (including the CSV/Excel-friendly timesheet exports for Payroll/Administration — see [PRODUCT_REQUIREMENTS.md §3](./PRODUCT_REQUIREMENTS.md#3-non-goals-initial-release)), or endpoints intended for future external/API consumption.
- See [API_CONVENTIONS.md](./API_CONVENTIONS.md) for validation, error shape, and naming conventions shared by both.

## 12. Deployment

- Vercel hosts the Next.js app; Supabase Cloud hosts Postgres/Auth/Storage.
- Environments: `local` (Supabase local dev or a dedicated dev project), `preview` (Vercel preview deployments against a shared staging Supabase project), `production`.
- Database schema changes are applied via versioned SQL migrations (Supabase CLI `migrations/` directory), never via ad hoc dashboard edits in shared environments — see [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for when this tooling is introduced. The Custom Access Token Auth Hook ([§3.2](#32-organization-membership-model)) is Supabase project **configuration**, not a migration file — it must be set up (and re-set-up per environment) alongside the migrations, which is called out explicitly in the implementation plan so it isn't missed when standing up a new environment.

## 13. Explicitly Deferred (avoid premature complexity)

- No client-side global state library (Redux/Zustand/etc.) — App Router server components + React state/URL state is sufficient until a concrete cross-cutting client state need appears.
- No GraphQL layer — Server Functions + typed Supabase queries cover the app's own needs; a public API is out of scope for v1 per [PRODUCT_REQUIREMENTS.md](./PRODUCT_REQUIREMENTS.md#3-non-goals-initial-release).
- No background job framework yet — scheduled work (e.g., certificate-expiry notification sweeps, per [DATABASE_SCHEMA.md — `document_expiry_notification_log`](./DATABASE_SCHEMA.md#document_expiry_notification_log--tenant)) uses Vercel Cron calling a Route Handler.
- No multi-region/per-tenant database sharding — a single Postgres instance with RLS is sufficient at the scale this product is designed for initially.
- No organization-level configuration UI for the certificate-expiry notification schedule or for payroll-provider integrations yet — v1 ships fixed defaults per [PRODUCT_REQUIREMENTS.md](./PRODUCT_REQUIREMENTS.md), designed so a configuration layer can be added later without a schema rewrite, but that layer itself is not built now.
