# Implementation Plan

Milestones are ordered so that **authentication, multi-tenancy, multi-organization membership, roles, and RLS are proven correct before any business module is built on top of them.** Every milestone from M8 onward assumes the foundation (M1–M7) is in place and reuses it rather than re-solving auth/tenancy per module.

Each milestone lists **acceptance criteria** — the bar for calling it done, not just "code exists."

## M0 — Project Foundations & Tooling

Set up the scaffolding this plan depends on, without touching application features.

- Install and configure: Supabase client libraries (`@supabase/supabase-js`, `@supabase/ssr`), shadcn/ui (`components.json` + base primitives), `zod` for validation, Supabase CLI for local dev/migrations. A CSV/XLSX export library (e.g., `exceljs` or equivalent) for payroll exports is added when M17 starts, not here.
- Establish the folder structure from [ARCHITECTURE.md §4](./ARCHITECTURE.md#4-application-structure-module-based) (`modules/`, `lib/`, `components/`, `types/`) as empty/skeleton directories with a `README` or placeholder where useful.
- Add `.env.local.example` documenting required environment variables (no real values) per [ARCHITECTURE.md §7](./ARCHITECTURE.md#7-secrets-and-environment-variables).

**Acceptance criteria**
- `npm run dev` and `npm run build` succeed with no application behavior change.
- `npm run lint` passes with the existing ESLint config.
- A teammate can clone the repo, copy `.env.local.example` → `.env.local`, fill in Supabase project values, and run the app against a real Supabase project with zero other setup steps.

## M1 — Supabase Project & Local Dev Workflow

**Status: partially done.** `supabase init` has been run (`supabase/config.toml` exists) and `supabase/migrations/` holds real migration files (see M2). Not done: no `dev`/`staging` Supabase project has been provisioned or linked (`supabase link`) — this environment has no CLI-level project credentials — so nothing has been pushed anywhere, and the `types/database.ts` generation script below doesn't exist yet (the file is hand-written for now; see its own header comment and [DATABASE_SCHEMA.md — Implementation Status](./DATABASE_SCHEMA.md#implementation-status)).

- Provision Supabase projects for `dev` and `staging` (production created later, closer to launch).
- Initialize Supabase CLI in the repo; establish `supabase/migrations/` as the only path by which schema changes reach a shared environment (no dashboard-only edits on `staging`/`production`).
- Wire `types/database.ts` generation (`supabase gen types typescript`) into a documented `npm run` script.

**Acceptance criteria**
- A schema change made via a new migration file, run locally, produces an updated `types/database.ts` via the script.
- Migration history is reproducible: dropping and recreating the local dev database from `supabase/migrations/` produces an identical schema.

## M2 — Core Schema & Tenant Isolation (RLS Foundation)

**Status: schema, RLS, and helper functions are written and migrated; not yet applied to any remote project; built via a different mechanism than originally specified here — see below.**

Implemented, via migration (`supabase/migrations/`, 10 files — see the database-foundation milestone's implementation report for the exact list and order): `organizations`, `profiles`, `organization_memberships`, `membership_roles`, `audit_events` (named `audit_logs` in the version of this milestone originally written here — see [DATABASE_SCHEMA.md — Implementation Status](./DATABASE_SCHEMA.md#implementation-status) for this and the two other naming/mechanism deviations), plus `roles` (a table, not the `user_role` enum this milestone originally specified), the `membership_status`/`organization_status`/`audit_action` enums, `updated_at` and `handle_new_user` (auto-creates a `profiles` row on signup) triggers, an immutability trigger on `audit_events`, and the `is_organization_member()`/`has_organization_role()` helper functions — per [DATABASE_SCHEMA.md §3](./DATABASE_SCHEMA.md#3-core-tables) and [§8.1](./DATABASE_SCHEMA.md#81-as-implemented-this-milestone).

**Not implemented**: `platform_super_admins` (nothing yet needs it — no in-app org creation exists to gate) and the **Custom Access Token Auth Hook** that would embed a validated active-organization claim in the session JWT (see [ARCHITECTURE.md §3.2](./ARCHITECTURE.md#32-organization-membership-model)) — that requires Supabase project/dashboard configuration this milestone had no credentials for. Tenant isolation does not depend on either: `is_organization_member()`/`has_organization_role()` check membership **per row, per explicit organization id**, with no "active organization" concept involved in the enforcement itself. If/when the Auth Hook is built, `is_platform_super_admin()`, `current_org_id()`, and `current_role_ids()` (all designed but not implemented — see [DATABASE_SCHEMA.md §8.2](./DATABASE_SCHEMA.md#82-original-design-future-enhancement-not-yet-built)) are the natural next layer on top, not a replacement for what's here.

**Acceptance criteria (as implemented — see the note above for how these differ from the milestone as originally written)**
- RLS is enabled and **forced** on `organizations`, `profiles`, `organization_memberships`, `roles`, `membership_roles`, and `audit_events`.
- An automated test proves: a user with an active membership in Org A only, querying any of the six tables, never receives a row belonging to Org B — including when attempting to pass Org B's id explicitly in a filter, and including for a user who has memberships in *both* orgs (each query result is correctly scoped to the org(s) that specific user actually belongs to, per row, not to one globally "current" org). **Not yet run against a real database** — no linked project exists in this environment (see the implementation report); this is written as the acceptance bar for whoever applies the migrations next, not as something already verified end-to-end.
- Suspending a user's membership in an org (status → `suspended`) causes `is_organization_member(that_org_id)` to return `false` for that user on their **very next** call — trivially true given the function queries `organization_memberships` live on every invocation, but still worth an explicit test given how much tenant isolation depends on it.
- Attempting an `insert`/`update` that sets `organization_id` to an org the caller has no active membership in is rejected by the database (not just the application).
- `audit_events` cannot be updated or deleted through the API by any role — verified against RLS (no policy grants it) **and** against the hard trigger directly (attempt the operation as a role that bypasses RLS, e.g. via the Supabase SQL editor as `postgres`, and confirm the trigger still rejects it).
- This is verified **before** any other table is added — it is the pattern every later table copies.
- Deferred to when `platform_super_admins`/the Auth Hook are actually built: a PSA-provisioning test, and an active-organization-switch test.

## M3 — Authentication

- Supabase Auth (email/password at minimum) wired via `@supabase/ssr`.
- `proxy.ts` (Next.js 16's `middleware.ts` successor) refreshes the session cookie and redirects unauthenticated users out of `(app)`/`(platform)` route groups.
- `app/unauthorized.tsx` and `app/forbidden.tsx` implemented per [ARCHITECTURE.md §5](./ARCHITECTURE.md#5-authentication--session-handling); `lib/auth/session.ts` exposes `requireUser()`. (Resolving a validated active org + role set automatically inside `requireUser()` itself depends on the Auth Hook from M2, which isn't built — see M2's status note. `requireOrganizationMembership(organizationId)`/`requireRole(organizationId, roleName)`, added once the M2 schema existed, take an explicit org id instead.)
- Login, `accept-invite` (completes an invited membership — not public self-registration, see [PRODUCT_REQUIREMENTS.md §3](./PRODUCT_REQUIREMENTS.md#3-non-goals-initial-release)), logout, and (if in scope for v1) password reset flows.
- `select-organization` route: shown when a user has no valid active organization (no memberships, or more than one and none chosen yet).

**Acceptance criteria**
- Visiting any `(app)` route while signed out redirects to login; after login, the user lands back on the originally requested route (or `select-organization` if they have no valid active org).
- A Server Function that calls `requireUser()` throws/redirects correctly when invoked with an expired or missing session — verified with a test that calls the action directly (not just through the UI), matching the "Proxy is not the only check" principle in [ARCHITECTURE.md §5](./ARCHITECTURE.md#5-authentication--session-handling).
- No Supabase service-role key appears in any client bundle (verified by inspecting the built output).

## M4 — Organization Onboarding & User Management

- Platform Super Admin flow to provision a new `organizations` row and its first Company Admin. **v1 is exclusively PSA-provisioned — there is no public/self-serve "create your company" flow to build.**
- Company Admin UI to invite users to their active organization (creates/reuses a `profiles` row + an `organization_memberships` row with `status = invited`), assign one or more roles via `membership_roles`, and suspend/reactivate/remove memberships.
- Organization switcher UI (`select-organization`) for users with more than one active membership, calling `switchActiveOrganization()`.

**Acceptance criteria**
- A newly invited user can complete `accept-invite` and lands in the correct organization with the correct role(s) — verified end-to-end, not just at the database level.
- A suspended membership blocks that user's access to that specific organization only, but their historical records (once other modules exist) remain intact and attributed; a second, unrelated active membership in another org is unaffected.
- A user with memberships in two organizations can switch between them and observes different data/permissions in each, without signing out.
- Inviting the same person (same email) to a second organization does not create a second `profiles` row — it creates a second `organization_memberships` row against the existing identity.

## M5 — Roles & Permissions Framework (Multi-Role)

- Implement the `modules/<domain>/permissions.ts` pattern from [ARCHITECTURE.md §6](./ARCHITECTURE.md#6-authorization-model), taking the caller's **full role array** for their active organization, not a single role.
- Build one reference module end-to-end (recommend **Employee Profiles**, the simplest core entity) with full RLS + `permissions.ts` + Server Functions + UI, to prove the multi-role union pattern before it's replicated across every later module.

**Acceptance criteria**
- The Employee Profiles module's access behavior matches the [permission matrix row for Employee Profiles](./ROLES_AND_PERMISSIONS.md#4-core-operations-modules) exactly, for every individual role — verified with a test matrix, not spot-checked.
- A user holding two roles that individually grant different levels of access to the same module (e.g., a role granting **V** and a role granting **M**) ends up with the **union** (M) — verified with a test user holding both roles simultaneously, not just tested per-role in isolation.
- A permission decision is never made in only one layer — e.g., a role that shouldn't see another project's employee is blocked by RLS even if a `permissions.ts` check were hypothetically removed.

## M6 — Audit Logging Foundation

**Status: the table itself is already built, ahead of this milestone** — `audit_events` (append-only, per [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md#audit_events--tenant-append-only--implemented); named `audit_logs` when this milestone was originally written) exists as of M2, along with RLS and a hard immutability trigger. What's left for M6 specifically: a shared `writeAuditLog()` server-side helper, wired into a real module's mutations.

- Shared `writeAuditLog()` server-side helper, wrapping an insert into `audit_events`.
- Wire it into the Employee Profiles module's mutations (create/update/soft-delete) as the reference implementation.

**Acceptance criteria**
- Every mutation to `employee_profiles` produces exactly one corresponding `audit_events` row with correct actor, action, and diff.
- No role, including Company Admin, can update or delete an `audit_events` row — already true as of M2 (RLS grants no such policy, and a hard trigger rejects both operations unconditionally, for every role); re-verify here in the context of a real mutation path, not just directly against the table.

## M7 — Cross-Reference Validation Helper

A small but foundational milestone: implement the shared server-side validation helper described in [ARCHITECTURE.md §3.4](./ARCHITECTURE.md#34-cross-reference-validation-rule) — given a `profiles.id` (or a polymorphic `entity_type`/`entity_id` pair) and a target `organization_id`, confirm existence, organization match (or legitimate global/system exemption), and caller permission. Every later module that writes a `profiles` reference or a polymorphic reference calls this instead of re-implementing the check.

**Acceptance criteria**
- Attempting to set `employee_profiles.user_id` (or any similar reference) to a `profiles.id` belonging to someone with no active membership in the target organization is rejected with a clear validation error, not a silent success or a generic database error.
- The helper is unit-tested against all three failure modes (doesn't exist / wrong organization / caller lacks permission) independently of any specific module.

---

With M1–M7 complete, the foundation — auth, multi-org tenancy, multi-role authorization, RLS, audit logging, and cross-reference validation — is proven. Every milestone below reuses it rather than re-implementing it.

## M8 — Projects & Locations

- `projects`, `project_locations` tables and CRUD, scoped per the [permission matrix](./ROLES_AND_PERMISSIONS.md#4-core-operations-modules).

**Acceptance criteria**
- Project-scoped roles (PM/SV/IN/PL) only see projects they're assigned to; org-scoped roles see all projects in their active org; cross-org access is impossible (regression-tested against the M2 isolation test).
- Location hierarchy (parent/child work areas) renders and is navigable at least two levels deep.

## M9 — Daily Workforce Scheduling

- `schedule_entries` CRUD; Planner/Supervisor build a day's crew list; Employee sees their own assignment.

**Acceptance criteria**
- The unique-active-assignment-per-day constraint is enforced and surfaces as a clear validation error in the UI, not a raw database error.
- Mobile view: an Employee can see "where am I today" in under two taps from login.

## M10 — Timesheets, Hour Discrepancy Requests & Payroll Export

- `timesheets` CRUD with draft → submitted → approved/rejected flow; `hour_discrepancy_requests` flow.
- CSV and Excel-friendly (XLSX) export of approved timesheets for a project/date range, for Payroll/Administration and Company Admin — export-only, **no payroll-provider integration**.

**Acceptance criteria**
- An Employee can submit hours against their schedule entry from a phone in under 60 seconds for the common case (pre-filled from the schedule).
- A Supervisor approving/rejecting hours produces an audit log entry with before/after values.
- A discrepancy request is resolvable end-to-end (open → in review → approved/rejected) with the timesheet updated on approval.
- Both the CSV and XLSX export for a sample project/date range open correctly in common spreadsheet software and match the underlying `timesheets` rows exactly (no silent rounding/truncation, correct column headers).

## M11 — Employee Documents, Certificates & Expiry Notifications

- `employee_documents` CRUD, file upload to Supabase Storage.
- `employee_profiles.supervisor_id` (direct supervisor assignment).
- Scheduled expiry-notification sweep (Vercel Cron → Route Handler) against `document_expiry_notification_log`, implementing the fixed default schedule and recipient set from [PRODUCT_REQUIREMENTS.md §7](./PRODUCT_REQUIREMENTS.md#7-certificate-expiry-notification-schedule).

**Acceptance criteria**
- A document nearing its `expiry_date` produces exactly one notification per milestone (60/30/14/7 days before, on expiry) to each of: the employee, their direct supervisor (if `supervisor_id` is set), everyone holding HSEQ Manager in the org, and everyone holding Company Admin or Payroll/Administration in the org — verified by seeding a document at each boundary date and running the sweep.
- The sweep does not re-send an already-sent one-time milestone (verified by running it twice for the same date).
- A document left expired and unresolved continues to produce a recurring notification at the defined interval, and stops once the document is renewed/replaced.
- File access is via signed URL; the storage bucket is confirmed private (a direct unauthenticated request to the object URL fails).

## M12 — Notifications (In-App)

- `notifications` table + UI; triggered by document expiry (M11), timesheet approval needed (M10), and later HSEQ events.

**Acceptance criteria**
- A relevant event (e.g., timesheet submitted) produces a notification visible to the correct recipient within the same session, without a page reload (via Supabase Realtime or client-side revalidation — implementation choice made at build time).

## M13 — HSEQ Shared Infrastructure: Event Categories, Attachments, Signatures, Corrective Actions

Built before the individual HSEQ forms (M14–M16) because incident/near-miss/observation classification, LMRA, toolbox talks, inspections, and safety walks all depend on it.

- `event_categories` seeded with the nine system categories via migration; Company Admin/HSEQ Manager UI to add/deactivate organization-specific custom categories.
- `attachments`, `digital_signatures` (with `signer_name_snapshot`, `document_version`, `attestation_text`, and conditional `ip_address`/`user_agent` capture), `corrective_actions` tables and shared UI components (file upload widget, signature capture widget, "raise a corrective action from this record" action).

**Acceptance criteria**
- The nine system categories exist after running migrations on a fresh database and cannot be edited or deleted through the application by any role, including Company Admin and Platform Super Admin.
- An organization can add a custom category and use it on an incident report; a *different* organization cannot see or select that custom category (cross-tenant isolation applies to `event_categories` exactly as it does to any other tenant table).
- The signature capture widget produces a `digital_signatures` row with a populated `signer_name_snapshot` and `document_version`, that cannot subsequently be edited by anyone, including the signer (verified at RLS level).
- A corrective action can be raised from a stub/test HSEQ record and appears on the assignee's corrective-action list; attempting to raise one against a record in a different organization is rejected by the cross-reference validation helper (M7), not just by RLS.

## M14 — LMRA & Toolbox Talks

**Acceptance criteria**
- A Supervisor can run an LMRA or toolbox talk and capture attendee signatures for a full crew (5–15 people) in under 3 minutes on a phone.
- A "no-go" LMRA result is visually distinct and surfaces to the Project Manager/HSEQ Manager without them needing to open the record.

## M15 — Scaffold Inspections & Safety Walks

**Acceptance criteria**
- A red-tag scaffold inspection automatically prompts creation of a corrective action (via the M13 shared flow), not left as a dangling finding.
- Inspection checklist items are individually recorded (pass/fail/n-a), not collapsed into a single free-text note.

## M16 — Incident Reports, Near-Miss Reports, Safety Observations

- Incident Reports use `event_categories.category_id` (system + custom categories) and the four-level `hseq_severity` scale; Safety Observations use `category_id` for unsafe-act/unsafe-condition tagging.

**Acceptance criteria**
- Any authenticated Employee can submit an incident/near-miss/observation from the field in under 5 taps to the first input field (low-friction reporting is a stated product goal).
- Category and severity selections drive downstream reporting (M17) — verified by confirming a submitted incident appears correctly bucketed on the incident-trends report by both its category and its severity.
- A user cannot select another organization's custom category when filing an incident (system categories remain selectable by everyone).

## M17 — Reports & Dashboards

- Role-scoped dashboards: hours/attendance (Ops/Payroll), open safety items & incident trends by category/severity (HSEQ), compliance status (documents + inspections due).

**Acceptance criteria**
- Each dashboard's numbers are independently verifiable against a direct database query for at least one full test dataset (no silent double-counting or stale caching).
- The CSV and XLSX timesheet exports (built in M10) match the underlying `timesheets` rows exactly for a sample project/date range.

## M18 — Production Hardening

- Accessibility pass (contrast, tap targets, screen-reader labels on field-facing forms).
- Security review: confirm no service-role key exposure, confirm RLS coverage on every tenant table (no table accidentally left without `force row level security`), review Storage bucket policies, confirm the Custom Access Token Auth Hook is correctly configured (and re-validated, per M2) in the production Supabase project specifically — not just copied from staging and assumed correct.
- Performance pass on mobile (Lighthouse mobile score, real-device test on a mid-tier Android phone with throttled 4G).
- Production Supabase project provisioned; Vercel production environment configured; migration promotion process (`dev` → `staging` → `production`) documented and rehearsed, including the Auth Hook setup step from M2.

**Acceptance criteria**
- A scripted RLS audit (query `pg_tables` / `pg_policies`) confirms every tenant table from [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) has RLS forced and at least one policy per operation.
- A field-facing flow (LMRA or timesheet entry) is usable end-to-end on a throttled connection without errors or unrecoverable UI states.
- A production smoke test confirms a brand-new user, invited by a Platform-Super-Admin-provisioned Company Admin, can accept the invite, land in the correct organization, and be blocked from every other organization on the platform.

---

## Open Questions

These block the specific milestone noted, not the whole plan — work can proceed on everything before that point while they're resolved. Items resolved by the confirmed product decisions in this revision have been removed from this table (organization membership model, role model, org onboarding path, payroll scope, incident severity scale, digital signature approach, and expiry notification schedule/recipients are no longer open).

| Question | Blocks | Owner needed |
|---|---|---|
| Regulatory recordability/reporting format beyond the internal category model (e.g., OSHA-style recordability), and for which jurisdictions | M16/M17 | HSEQ/Compliance stakeholder |
| Fixed two-level vs. arbitrary-depth Project Location hierarchy | M8 | Product (schema already supports arbitrary depth; this is a UX/scope question, not a blocker) |
| Who has Supabase project dashboard access to configure the Custom Access Token Auth Hook per environment | M2 | Whoever owns infra access — needs naming before M2 can be fully closed out, not before it can start |
| Is Company Admin + Payroll/Administration the right default "designated administration recipient" set for expiry notifications, or should it be a specific configurable individual | M11 | Product |
| Should HSEQ Manager be the sole role permitted to create custom incident/observation categories, or also Company Admin (current default: both) | M13 | Product |
