# Implementation Plan

Milestones are ordered so that **authentication, multi-tenancy, multi-company membership, roles, and RLS are proven correct before any business module is built on top of them.** Every milestone from M8 onward (and M7.6, the first business module, inserted right after the M7.5 shell — see that milestone for why it isn't a renumbered M8) assumes the foundation (M1–M7) is in place and reuses it rather than re-solving auth/tenancy per module.

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

Implemented, via migration (`supabase/migrations/`, 10 files — see the database-foundation milestone's implementation report for the exact list and order): `companies`, `profiles`, `company_memberships`, `membership_roles`, `audit_events` (named `audit_logs` in the version of this milestone originally written here — see [DATABASE_SCHEMA.md — Implementation Status](./DATABASE_SCHEMA.md#implementation-status) for this and the two other naming/mechanism deviations), plus `roles` (a table, not the `user_role` enum this milestone originally specified), the `membership_status`/`company_status`/`audit_action` enums, `updated_at` and `handle_new_user` (auto-creates a `profiles` row on signup) triggers, an immutability trigger on `audit_events`, and the `is_company_member()`/`has_company_role()` helper functions — per [DATABASE_SCHEMA.md §3](./DATABASE_SCHEMA.md#3-core-tables) and [§8.1](./DATABASE_SCHEMA.md#81-as-implemented-this-milestone).

**Not implemented**: `platform_super_admins` (nothing yet needs it — no in-app company creation exists to gate) and the **Custom Access Token Auth Hook** that would embed a validated active-company claim in the session JWT (see [ARCHITECTURE.md §3.2](./ARCHITECTURE.md#32-company-membership-model)) — that requires Supabase project/dashboard configuration this milestone had no credentials for. Tenant isolation does not depend on either: `is_company_member()`/`has_company_role()` check membership **per row, per explicit company id**, with no "active company" concept involved in the enforcement itself. If/when the Auth Hook is built, `is_platform_super_admin()`, `current_org_id()`, and `current_role_ids()` (all designed but not implemented — see [DATABASE_SCHEMA.md §8.2](./DATABASE_SCHEMA.md#82-original-design-future-enhancement-not-yet-built)) are the natural next layer on top, not a replacement for what's here.

**Acceptance criteria (as implemented — see the note above for how these differ from the milestone as originally written)**
- RLS is enabled and **forced** on `companies`, `profiles`, `company_memberships`, `roles`, `membership_roles`, and `audit_events`.
- An automated test proves: a user with an active membership in Company A only, querying any of the six tables, never receives a row belonging to Company B — including when attempting to pass Company B's id explicitly in a filter, and including for a user who has memberships in *both* orgs (each query result is correctly scoped to the company(s) that specific user actually belongs to, per row, not to one globally "current" company). **Not yet run against a real database** — no linked project exists in this environment (see the implementation report); this is written as the acceptance bar for whoever applies the migrations next, not as something already verified end-to-end.
- Suspending a user's membership in an company (status → `suspended`) causes `is_company_member(that_org_id)` to return `false` for that user on their **very next** call — trivially true given the function queries `company_memberships` live on every invocation, but still worth an explicit test given how much tenant isolation depends on it.
- Attempting an `insert`/`update` that sets `company_id` to an company the caller has no active membership in is rejected by the database (not just the application).
- `audit_events` cannot be updated or deleted through the API by any role — verified against RLS (no policy grants it) **and** against the hard trigger directly (attempt the operation as a role that bypasses RLS, e.g. via the Supabase SQL editor as `postgres`, and confirm the trigger still rejects it).
- This is verified **before** any other table is added — it is the pattern every later table copies.
- Deferred to when `platform_super_admins`/the Auth Hook are actually built: a PSA-provisioning test, and an active-company-switch test.

## M3 — Authentication

- Supabase Auth (email/password at minimum) wired via `@supabase/ssr`.
- `proxy.ts` (Next.js 16's `middleware.ts` successor) refreshes the session cookie and redirects unauthenticated users out of `(app)`/`(platform)` route groups.
- `app/unauthorized.tsx` and `app/forbidden.tsx` implemented per [ARCHITECTURE.md §5](./ARCHITECTURE.md#5-authentication--session-handling); `lib/auth/session.ts` exposes `requireUser()`. (Resolving a validated active company + role set automatically inside `requireUser()` itself depends on the Auth Hook from M2, which isn't built — see M2's status note. `requireCompanyMembership(companyId)`/`requireRole(companyId, roleName)`, added once the M2 schema existed, take an explicit company id instead.)
- Login, `accept-invite` (completes an invited membership — not public self-registration, see [PRODUCT_REQUIREMENTS.md §3](./PRODUCT_REQUIREMENTS.md#3-non-goals-initial-release)), logout, and (if in scope for v1) password reset flows.
- `select-company` route: shown when a user has no valid active company (no memberships, or more than one and none chosen yet).

**Acceptance criteria**
- Visiting any `(app)` route while signed out redirects to login; after login, the user lands back on the originally requested route (or `select-company` if they have no valid active company).
- A Server Function that calls `requireUser()` throws/redirects correctly when invoked with an expired or missing session — verified with a test that calls the action directly (not just through the UI), matching the "Proxy is not the only check" principle in [ARCHITECTURE.md §5](./ARCHITECTURE.md#5-authentication--session-handling).
- No Supabase service-role key appears in any client bundle (verified by inspecting the built output).

## M4 — Company Onboarding & User Management

- Platform Super Admin flow to provision a new `companies` row and its first Company Admin. **v1 is exclusively PSA-provisioned — there is no public/self-serve "create your company" flow to build.**
- Company Admin UI to invite users to their active company (creates/reuses a `profiles` row + an `company_memberships` row with `status = invited`), assign one or more roles via `membership_roles`, and suspend/reactivate/remove memberships.
- Company switcher UI (`select-company`) for users with more than one active membership, calling `switchActiveCompany()`.

**Acceptance criteria**
- A newly invited user can complete `accept-invite` and lands in the correct company with the correct role(s) — verified end-to-end, not just at the database level.
- A suspended membership blocks that user's access to that specific company only, but their historical records (once other modules exist) remain intact and attributed; a second, unrelated active membership in another company is unaffected.
- A user with memberships in two companies can switch between them and observes different data/permissions in each, without signing out.
- Inviting the same person (same email) to a second company does not create a second `profiles` row — it creates a second `company_memberships` row against the existing identity.

## M5 — Roles & Permissions Framework (Multi-Role)

**Status: substantially fulfilled by M7.6 — Employee Management Foundation**, later in the sequence than originally planned (after the M7.5 shell, not right after M4) and under the table's real implemented name, `employees` (not `employee_profiles`). `requireAnyRole()`/`getUserRoleNames()` ([lib/auth/session.ts](./ARCHITECTURE.md#6-authorization-model)) and `modules/employees/permissions.ts` are the reference implementation this milestone called for. One nuance didn't end up applying: the Employees permission model only has **two** tiers (manage vs. view-only), not the full five-level F/M/C/O/V legend, so there was no "which of two differently-graded roles wins" precedence question to prove — that specific acceptance criterion (below) remains open for whichever future module is the first to actually combine two different non-trivial grant levels for the same module.

- Implement the `modules/<domain>/permissions.ts` pattern from [ARCHITECTURE.md §6](./ARCHITECTURE.md#6-authorization-model), taking the caller's **full role array** for their active company, not a single role.
- Build one reference module end-to-end (recommend **Employee Profiles**, the simplest core entity) with full RLS + `permissions.ts` + Server Functions + UI, to prove the multi-role union pattern before it's replicated across every later module.

**Acceptance criteria**
- The Employees module's access behavior matches the [permission matrix row for Employees](./ROLES_AND_PERMISSIONS.md#4-core-operations-modules) exactly, for every individual role — verified with a test matrix, not spot-checked.
- A user holding two roles that individually grant different levels of access to the same module (e.g., a role granting **V** and a role granting **M**) ends up with the **union** (M) — verified with a test user holding both roles simultaneously, not just tested per-role in isolation.
- A permission decision is never made in only one layer — e.g., a role that shouldn't see another project's employee is blocked by RLS even if a `permissions.ts` check were hypothetically removed.

## M6 — Audit Logging Foundation

**Status: the table itself is already built, ahead of this milestone** — `audit_events` (append-only, per [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md#audit_events--tenant-append-only--implemented); named `audit_logs` when this milestone was originally written) exists as of M2, along with RLS and a hard immutability trigger. What's left for M6 specifically: a shared `writeAuditLog()` server-side helper, wired into a real module's mutations.

- Shared `writeAuditLog()` server-side helper, wrapping an insert into `audit_events`.
- Wire it into the Employees module's mutations (create/update/archive) as the reference implementation.

**Status note**: `modules/employees/actions.ts` (built as part of M7.6) writes `audit_events` rows directly at each mutation site rather than through a separate shared `writeAuditLog()` helper — there was exactly one module doing it by the time M7.6 shipped, so extracting a helper would have been premature; revisit once a second module needs the same insert shape.

**Acceptance criteria**
- Every mutation to `employees` produces exactly one corresponding `audit_events` row with correct actor, action, and diff.
- No role, including Company Admin, can update or delete an `audit_events` row — already true as of M2 (RLS grants no such policy, and a hard trigger rejects both operations unconditionally, for every role); re-verify here in the context of a real mutation path, not just directly against the table.

## M7 — Cross-Reference Validation Helper

A small but foundational milestone: implement the shared server-side validation helper described in [ARCHITECTURE.md §3.4](./ARCHITECTURE.md#34-cross-reference-validation-rule) — given a `profiles.id` (or a polymorphic `entity_type`/`entity_id` pair) and a target `company_id`, confirm existence, company match (or legitimate global/system exemption), and caller permission. Every later module that writes a `profiles` reference or a polymorphic reference calls this instead of re-implementing the check.

**Acceptance criteria**
- Attempting to set `employees.profile_id` (or any similar reference) to a `profiles.id` belonging to someone with no active membership in the target company is rejected with a clear validation error, not a silent success or a generic database error. (As of the Employee Management Foundation milestone, `employees.profile_id` still isn't application-settable through any create/edit form — this check applies once a future account-activation/invitation milestone starts writing it.)
- The helper is unit-tested against all three failure modes (doesn't exist / wrong company / caller lacks permission) independently of any specific module.

---

With M1–M7 complete, the foundation — auth, multi-company tenancy, multi-role authorization, RLS, audit logging, and cross-reference validation — is proven. M7.5 below builds the UI every later module (starting with M7.6) renders inside; every milestone from M7.6 on reuses both.

## M7.5 — Application Shell & Design System

**Status: implemented.** Numbered "M7.5" rather than inserted as a renumbered M8 (shifting every subsequent milestone) — this keeps every existing cross-reference to M8–M18 elsewhere in this document and others (e.g. [ROLES_AND_PERMISSIONS.md](./ROLES_AND_PERMISSIONS.md), [PRODUCT_REQUIREMENTS.md](./PRODUCT_REQUIREMENTS.md)) valid without a mechanical renumbering pass.

Not originally planned as its own milestone — the original version of this document assumed UI ships bundled with each business module. In practice, building a professional, reusable shell and component set once, before the first business module, avoids every later milestone (M8 onward) re-deriving its own page chrome and paying an inconsistent-UI tax. Pure UI/presentation layer — no new tables, no new RLS, no new authorization logic; see [UI_GUIDELINES.md §10–11](./UI_GUIDELINES.md#10-application-shell--navigation) for the full design record.

- shadcn/ui installed (Base UI-based — see [ARCHITECTURE.md §1](./ARCHITECTURE.md#1-technology-stack)) with a restrained neutral-plus-one-accent palette, media-query (not manual-toggle) dark mode.
- Management app shell: collapsible desktop sidebar / mobile drawer, top bar, company switcher, user menu, breadcrumbs — `components/app-shell/*`.
- Reusable design-system pieces — `components/shared/*` — `PageHeader`, `SectionHeader`, `StatCard`, `EmptyState`, `StatusIndicator`, `ConfirmDialog`, `ComingSoonPage`.
- All 14 primary nav items get a real route; 13 without a business module yet render the shared placeholder — no broken links.
- Company-aware dashboard rebuild: real membership/company data where it exists, explicitly-marked placeholders (never a fabricated number) everywhere else.
- Route-level `loading.tsx`/`error.tsx` for `(app)/*`, plus a root `error.tsx`.
- Documented (not built) architecture for a future, separate mobile-first employee portal — [UI_GUIDELINES.md §11](./UI_GUIDELINES.md#11-future-employee-portal-prepared-not-implemented).

**Acceptance criteria**
- Every item in the primary nav resolves to a real route and renders something (a real page or the shared "coming soon" placeholder) — zero 404s from clicking anything in the sidebar.
- The dashboard's only non-placeholder numeric value (team member count) matches a direct database count for a test company; every other stat card visibly reads as "not yet available," never as a real zero.
- A user with zero company memberships sees a dedicated empty state, not an error, a blank page, or a degraded version of the normal dashboard.
- A user with exactly one membership sees no company-switcher UI at all; a user with two or more sees a working switcher that updates `profiles.active_company_id` (verified via `requireCompanyMembership()`, not client-trusted) and is reflected immediately after the resulting page refresh.
- `npm run lint` and `npm run build` both pass with the shell in place.
- Keyboard-only navigation reaches every interactive element in the shell (sidebar toggle, nav items, company switcher, user menu, sign-out confirmation) with visible focus states.

## M7.6 — Employee Management Foundation

**Status: implemented.** Numbered "M7.6" for the same reason M7.5 was — inserted after the application shell without renumbering M8 onward, keeping every existing cross-reference elsewhere in this document (and in [ROLES_AND_PERMISSIONS.md](./ROLES_AND_PERMISSIONS.md), [PRODUCT_REQUIREMENTS.md](./PRODUCT_REQUIREMENTS.md)) valid.

The first real business module, built directly on the M1–M7 foundation and the M7.5 shell: a company employment record (`employees`) that reuses `company_memberships`/`membership_roles`/`roles` as its **only** role system — no second, employee-specific authorization mechanism. This platform supports employees only in v1 — no generic person/visitor/contractor/external-company concept; see [PRODUCT_REQUIREMENTS.md §5.3](./PRODUCT_REQUIREMENTS.md#53-employees).

- `employees` table: name, employee number, work email, phone, position, `employment_status`, `account_status`, birth/start/end date — see [DATABASE_SCHEMA.md — `employees`](./DATABASE_SCHEMA.md#employees--tenant--implemented). An employee record can exist entirely without a linked login/profile (`account_status: 'draft'`), and stays meaningful even if never linked at all.
- New `has_any_company_role(target_org_id, role_names)` RLS helper, and `employees` RLS: company_admin/operations_manager may create/edit; company_admin/operations_manager/hseq_manager/project_manager/supervisor/inspector/planner/payroll_admin may read company-wide; anyone may read their own linked record (`profile_id = auth.uid()`); no `DELETE` policy at all — archiving (`account_status = 'archived'`) is the only removal path.
- `membership_roles` gains its first `INSERT`/`DELETE` RLS policies (previously fully deferred) so the Roles tab can assign/remove an employee's company roles through the real membership/role tables — not a parallel mechanism. Operations Manager may not assign/remove `company_admin`; neither role may assign `platform_super_admin` through this UI. A dedicated policy clause blocks removing an company's last active `company_admin` role assignment, at the database level.
- `app/(app)/employees/*`: list (search/filter/archived toggle, responsive table+cards), `/new`, `/[employeeId]` (Overview + Roles tabs functional; Projects/Certificates/Documents/Audit explicit placeholders), `/[employeeId]/edit`, archive with confirmation. (Routed by internal UUID at this milestone — M7.6a below changes this to the employee number.)
- `modules/employees/permissions.ts` — the first `permissions.ts` module realizing the role-array authorization pattern [ARCHITECTURE.md §6](./ARCHITECTURE.md#6-authorization-model) had described but not yet built.
- Explicitly **not** built this milestone: account activation/invitations, projects, certificates, documents, attendance/hours/leave/PPE, notifications beyond placeholder tabs. The future "one open workday-review case per employee per date" rule is documented, not implemented — see [PRODUCT_REQUIREMENTS.md §5.8](./PRODUCT_REQUIREMENTS.md#58-hour-discrepancy-requests).

**Acceptance criteria**
- A user without `company_admin`/`operations_manager` cannot create, edit, or archive an employee — neither through the UI (button hidden) nor via a direct Server Function call or a direct URL to `/employees/new` or `/[employeeId]/edit` (both reject server-side, matching the RLS policy).
- Employee numbers are unique within an company but the same number is reusable in a different company.
- Archiving an employee sets `account_status = 'archived'` and `archived_at`, hides them from the default list, and the row remains fully intact in the database (queryable with the archived filter, never deleted).
- Removing an company's last `company_admin` role assignment through the Roles tab is rejected (database-enforced, not just a UI guard).
- An `operations_manager` cannot assign or remove `company_admin` (or `platform_super_admin`) via the Roles tab, even by calling the Server Function directly.
- A user holding no manager/read role for the company, viewing `/employees/[employeeId]` for their own linked record, sees only their own record — never another employee's, and never the full list.
- `npm run lint` and `npm run build` both pass with the module in place.

## M7.6a — Employee Management Polish

**Status: implemented in code; not yet applied to the linked remote Supabase project beyond what M7.6 already applied — see this milestone's implementation report for the exact list of pending migrations.** A direct follow-up to M7.6, fixing issues found in manual testing and closing gaps the original milestone deferred, rather than a new business module — numbered `M7.6a` for the same non-renumbering reason as `M7.5`/`M7.6`. **Corrected in place** (a second review pass, before either new migration was ever applied) rather than patched with a third migration — see the bullets marked *(correction pass)* below.

- **Search fix**: `search_employees()` SQL function (`SECURITY INVOKER`, RLS-scoped) replaces the client-composed single-term PostgREST filter — a multi-word query like "john doe" (or "doe john") now requires every word to match somewhere across `first_name`/`last_name`/`employee_number`/`work_email` on the same row, not one literal substring in one column. See [DATABASE_SCHEMA.md — Employee search & pagination](./DATABASE_SCHEMA.md#employee-search--pagination).
- ***(correction pass)* Wildcard escaping**: search tokens are escaped (`escape_ilike_pattern()`, `ILIKE ... ESCAPE '\'`) before being embedded in a pattern — a literal `%` or `_` typed into the search box now matches literally instead of acting as an ILIKE wildcard.
- **Automatic, immutable employee numbers**: `companies.employee_number_prefix` (permanent, uppercase, URL-safe) + `company_employee_number_counters` (one row per company) + `allocate_employee_number()`/`next_employee_number()` (concurrency-safe via atomic `UPDATE...RETURNING`) generate `PREFIX-00001`-format numbers at creation time — never user-entered, never reusable after archive. A `BEFORE UPDATE` trigger (`employees_prevent_number_change`) makes the column immutable at the database level regardless of role. Existing employees with no number were backfilled in the same migration; the column is now `not null`. See [DATABASE_SCHEMA.md — Employee number generation](./DATABASE_SCHEMA.md#employee-number-generation).
- ***(correction pass)* Counter-initialization fix**: the original version of this migration initialized every company's counter at `1` regardless of pre-existing data — a legacy/manually-entered `VALUTRIS-00001` would have been silently re-issued to the next new employee. Corrected to compute, per company, the highest existing numeric suffix matching that company's prefix *before* initializing the counter (one past that, or `1` if none match); malformed/legacy numbers that don't match `PREFIX-<digits>` are left untouched and never considered. See [DATABASE_SCHEMA.md — Employee number generation](./DATABASE_SCHEMA.md#employee-number-generation).
- ***(correction pass)* Removed a broad Valutris name-match `UPDATE`**: an earlier revision set the Valutris company's prefix via `WHERE lower(name) LIKE 'valutris%'`, which could have silently repointed more than one company onto the same prefix. Removed — the deterministic slug-derived prefix already produces `VALUTRIS` for a `valutris` slug; see the implementation report for the exact manual SQL to run if the real slug differs.
- **Employee-number-based routing**: `/employees/[employeeId]` → `/employees/[employeeNumber]` (e.g. `/employees/VALUTRIS-00001`) — the internal UUID remains the database primary key and is still what every Server Function operates on internally, but no longer appears in a URL. `getEmployeeByNumber(companyId, employeeNumber)` (case-normalized, company-scoped, RLS-protected) is the new lookup.
- **Restore/unarchive**: `restoreEmployee()` (same `company_admin`/`operations_manager` gate as archive, same `employees_update_managers` RLS policy — no new policy needed) clears `archived_at` and resets `account_status` to `'draft'` (the required fallback; no richer pre-archive state is stored). Audit-logged with the pre-existing `restore` `audit_action` value (first real caller of it).
- ***(correction pass)* `archived_at` as the sole archive signal**: the original version of this milestone used `account_status = 'archived'` in several places (list default filtering, the Archive/Restore button choice) to decide whether an employee record was archived. Corrected everywhere to read `archived_at is null`/`is not null` instead — `account_status` remains a separate, independently-varying account/access lifecycle value, which future invitation/suspension/multi-company-access work depends on. See [PRODUCT_REQUIREMENTS.md §5.3](./PRODUCT_REQUIREMENTS.md#53-employees).
- **Colored, accessible status badges**: `modules/employees/components/status-badges.tsx` — one shared `EmploymentStatusBadge`/`AccountStatusBadge` pair, used by both the list and the profile page, so status→color is defined exactly once. Labels always render alongside color per [UI_GUIDELINES.md §3](./UI_GUIDELINES.md#3-design-tokens).
- **Fixed a Base UI console warning**: the employee search box was passing a `defaultValue` that changed on every URL update — Base UI's `Input` warns when an "uncontrolled" field's default value changes after mount. Converted to a genuinely controlled `value`+`onChange` input, resynced from the URL during render (not inside a `useEffect`, to satisfy `react-hooks/set-state-in-effect`). Added an explicit "Clear filters" control that also resets pagination.
- ***(correction pass)* Server-side pagination**: `lib/pagination.ts` (URL param parsing/validation/clamping — page defaults to 1, page size is clamped to `{25, 50, 100}` server-side, never trusting the URL) + `components/shared/pagination-bar.tsx` (generic, reusable page-size selector + Previous/Next/numbered-page controls, real `<Link>`-based navigation) + `count_employees()`/`search_employees(..., page_limit, page_offset)` (paired RPCs — total count fetched first so an out-of-range page is corrected via a real redirect before rows are ever queried). Deterministic ordering (`last_name, first_name, id`) prevents duplicate/skipped rows across pages. Changing any filter, or the page size, resets to page 1. Documented as the pattern future recruiter/Talent Pool lists must reuse — see [PRODUCT_REQUIREMENTS.md §11.6](./PRODUCT_REQUIREMENTS.md#116-future-recruiter-role--talent-pool-opt-in-cross-company).
- ***(correction pass)* Narrower list query**: `search_employees()` returns only the columns the list UI renders (10 columns) instead of full `employees` rows (18 columns) — `EmployeeListItem` in `modules/employees/types.ts`.
- ***(correction pass)* Function security hardening**: explicit `revoke all ... from public, anon, authenticated` added to `allocate_employee_number()` and the counter table (on top of the pre-existing "not granted" state) for clarity; confirmed `has_any_company_role()` (called by `next_employee_number()`) already requires an **active** `company_memberships.status`, so an invited/suspended/removed membership already cannot authorize a number allocation — no functional change needed there, just verified and documented.
- Documented, not implemented: the future identity/employment/position/Talent Pool/Platform-Super-Admin-dashboard architecture — see [PRODUCT_REQUIREMENTS.md §11](./PRODUCT_REQUIREMENTS.md#11-future-identity-employment-history--talent-pool-architecture-documented-not-implemented) and [ROLES_AND_PERMISSIONS.md §8](./ROLES_AND_PERMISSIONS.md#8-permission-roles-vs-work-positions-future).

**Acceptance criteria**
- Searching "john doe" or "doe john" (any case, with leading/trailing/repeated whitespace) finds an employee named John Doe; searching "john" or "doe" alone also finds them; searching a literal "%" or "_" matches only employees whose data actually contains that character, not "almost everyone."
- Typing in, or programmatically clearing, the employee search box produces no Base UI console warning.
- Creating an employee never presents an editable employee-number field and always assigns the next number for the company automatically, strictly above any pre-existing number for that company (including legacy/manually-entered ones); editing an employee never allows changing it, at the UI level and at the database level (a direct `UPDATE` attempt is rejected).
- Two employees in the same company can never end up with the same `employee_number`; the same number is safe to reuse across two different companies.
- `/employees/<number>` and `/employees/<number>/edit` resolve the correct employee, scoped to the caller's active company, with no UUID ever appearing in a normal employee link.
- Archiving, then restoring, an employee preserves its UUID, its `employee_number`, and every other field unchanged; the restored employee reappears in the default (non-archived) list with `account_status = 'draft'`; the Archive/Restore button choice and default-list visibility are driven by `archived_at`, never `account_status`.
- Default page size is 25; requesting an unsupported `pageSize` value (via the URL) safely falls back to 25 both client- and server-side; requesting an out-of-range `page` redirects to a valid one; changing a filter or the page size resets to page 1; the total-count summary always matches the active filters.
- `npm run lint` and `npm run build` both pass with these changes in place.

## M7.6b — Platform User ID

**Status: implemented in code; not yet applied to the linked remote project.** First implemented slice of the broader role/permissions/employment-lifecycle/project-visibility architecture worked out across the Employee Roles, Permissions, and Employment Lifecycle planning arc — the rest of that arc (role catalogue changes, employment periods/history, the audit-log extension, invitations, the Projects & Teams module, and the Platform Super Admin area) remains design-only, documented but not built. This slice was chosen first because it is fully self-contained: `profiles.user_number` has no dependency on any of the other planned pieces, and no application code path other than the existing `handle_new_user()` trigger ever writes to it.

- `profiles.user_number` — permanent, globally unique, publicly-safe identifier (`USR-XXXXXXXX`, 8-character random Crockford-Base32-style code), generated automatically at signup, immutable thereafter (`profiles_prevent_user_number_change` trigger — same enforcement shape as `employees.employee_number`'s immutability trigger). Existing profiles backfilled in the same migration. See [DATABASE_SCHEMA.md — `profiles`](./DATABASE_SCHEMA.md#profiles--global-identity-only--implemented).
- Deliberately random rather than sequential (unlike `employee_number`) — this identifier has no per-tenant RLS boundary narrowing who it identifies, so it must not be trivially enumerable the way a sequential platform-wide id would be.
- Database-only change: no new route, query, Server Function, or UI exists yet, because none is needed yet — there is no Platform Super Admin area to display or search it in (that remains a separate, not-yet-started future milestone), and no other code path writes to `profiles` besides the trigger this migration extends.
- `types/database.ts` updated by hand to keep the app compiling until this migration is applied and the file is regenerated — same "hand-maintain until regenerated" situation as every other schema change so far in this project.

**Acceptance criteria**
- Every new signup receives a `user_number` matching `^USR-[0-9A-HJKMNP-TV-Z]{8}$`, and it is never null.
- Every pre-existing profile is backfilled with one, without altering any other column.
- Attempting to `UPDATE profiles SET user_number = ...` on an already-assigned row is rejected, for every role, including the row's own owner.
- Two different profiles can never end up with the same `user_number`.
- `npm run lint` and `npm run build` both pass with this change in place.

## M7.6c — Role Catalogue & Permissions

**Status: implemented in code; not yet applied to the linked remote project.** Second slice of the Employee Roles, Permissions, and Employment Lifecycle planning arc — finalizes the company role catalogue itself so every later slice (project/team visibility, invitations, employment lifecycle, Platform Super Admin) builds against the real role set instead of the interim ten-role list carried over from M7.6/M7.6a. Scoped strictly to the role model: no project, team, invitation, employment-lifecycle, or Platform Super Admin logic is introduced here.

- **Retired `supervisor` and `payroll_admin`**, added `foreman`, `hse_officer`, and `recruiter`; kept `platform_super_admin`, `company_admin`, `operations_manager`, `project_manager`, `hseq_manager`, `inspector`, `planner`, `employee` — eleven roles total. See [ROLES_AND_PERMISSIONS.md §1](./ROLES_AND_PERMISSIONS.md#1-role-definitions) for the full table.
- **`roles.display_label`** — new required column, the human-facing name (e.g. `company_admin` → "Company Manager", `operations_manager` → "Workforce Coordinator", `hseq_manager` → "HSE Manager") separate from the stable `name` machine key that RLS/`permissions.ts` are written against; `name` never changes, `display_label` is presentation-only. See [DATABASE_SCHEMA.md — `roles`](./DATABASE_SCHEMA.md#roles--tenant--implemented).
- **Safe retirement**, one migration (`supabase/migrations/20260726120000_role_catalogue_update.sql`): add the three new role rows → migrate existing `supervisor` assignments to `foreman` (`payroll_admin` had no successor, its assignments are simply removed) → delete the two retired role rows last, relying on `membership_roles.role_id`'s `ON DELETE RESTRICT` as a final safety net against any missed reference.
- **RLS updated in place** via `ALTER POLICY` (not drop/recreate, since these policies are already applied): `employees_select_managers_or_own_record` drops `supervisor`/`payroll_admin` from its reader-role list and deliberately does **not** add `hse_officer`/`foreman`/`recruiter` — all three are meant to be project- or Talent-Pool-scoped once that infrastructure exists, and granting them company-wide read now would just have to be walked back later. `membership_roles_insert_managers`/`_delete_managers` gain an explicit restriction: Workforce Coordinator (`operations_manager`) may assign/remove the unelevated roles but may never promote/demote anyone into or out of Company Manager, Project Manager, HSE Manager, HSE Officer, Foreman, or Recruiter — only Company Manager can. See [DATABASE_SCHEMA.md §8.1](./DATABASE_SCHEMA.md#81-as-implemented-this-milestone).
- **`modules/employees/permissions.ts`**: `assignableRoleNamesFor()` mirrors the same Workforce Coordinator restriction at the application layer (RLS is the backstop, not the only check — [API_CONVENTIONS.md §6](./API_CONVENTIONS.md#6-server-side-authorization)); `EMPLOYEE_READ_ROLES` deliberately unchanged (still excludes the three new roles, for the same company-wide-visibility reason as the RLS policy above).
- **Role selectors** (`employee-roles-tab.tsx`, `employee-table.tsx`) render `display_label` instead of a title-cased `name`.
- **`supabase/seed.sql`** rewritten to the final eleven-role set so a fresh local database and an upgraded existing one converge on identical data.
- **Documentation**: [ROLES_AND_PERMISSIONS.md](./ROLES_AND_PERMISSIONS.md) rewritten for the new role set and permission matrices; stray references to the retired roles corrected across [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [PRODUCT_REQUIREMENTS.md](./PRODUCT_REQUIREMENTS.md), [UI_GUIDELINES.md](./UI_GUIDELINES.md), and [API_CONVENTIONS.md](./API_CONVENTIONS.md) (the M7.6 historical implementation note above, at line 140 of this file, is left as-written — an accurate record of what was true when M7.6 shipped, not retroactively edited).

**Acceptance criteria**
- The `roles` table contains exactly the eleven current roles, each with a non-null `display_label`; `supervisor` and `payroll_admin` no longer exist as rows.
- Every `membership_roles` row that referenced `supervisor` before the migration now references `foreman` instead; no row references a retired role (enforced by the foreign key itself, since the retired rows are gone).
- A user with only Workforce Coordinator cannot assign or remove Company Manager, Project Manager, HSE Manager, HSE Officer, Foreman, or Recruiter for anyone, at both the RLS layer and the Server Function layer; a direct RLS-bypassing attempt still fails.
- A user holding two roles simultaneously has the union of both roles' permissions — no role assignment ever reduces what another already-assigned role grants.
- Role pickers throughout the UI display human-readable labels ("Workforce Coordinator") never raw machine keys (`operations_manager`).
- `npm run lint` and `npm run build` both pass with these changes in place.

## M7.6d — Employment Lifecycle

**Status: implemented in code; not yet applied to the linked remote project.** Third slice of the Employee Roles, Permissions, and Employment Lifecycle planning arc — builds the actual hire/end/rehire lifecycle for company-scoped employee records, using `employee_employment_periods` as a first, narrower slice of the future employment-history direction from [PRODUCT_REQUIREMENTS.md §11.4](./PRODUCT_REQUIREMENTS.md#114-employment-history-implemented-narrower-than-originally-envisioned). Scoped strictly to employment state: no project/team logic, no invitations, no Platform Super Admin features, no identity redesign, no employee-numbering change, no payroll features.

- **`employee_employment_periods`** (`supabase/migrations/20260727090000_employment_periods.sql`) — the single source of truth for employment state. One row per continuous stretch of employment for an `employees` row; a rehire opens a new row on the **same** `employees` row, never a new one, which is what makes `employee_number` reuse on rehire automatic. See [DATABASE_SCHEMA.md — Employment lifecycle](./DATABASE_SCHEMA.md#employment-lifecycle-employee_employment_periods).
- **`employees.employment_status`/`start_date`/`end_date` become a derived, database-enforced snapshot**, not an independent source of truth — the columns stay (every existing read path keeps working unchanged), but `authenticated`'s `UPDATE` grant on them is revoked at the column-privilege level and re-granted only for the remaining, still-directly-editable columns. A `SECURITY DEFINER` trigger (`sync_employee_employment_snapshot`, firing off `employee_employment_periods`) is the only remaining writer. This is the mechanism that rules out the two-sources-of-truth problem the milestone's brief specifically called out, rather than relying on application convention alone.
- **Two new Server Functions**, both writing only to `employee_employment_periods`, never to `employees` directly: `endEmployment()` (closes the current open period — end date, a required reason, an optional note, `ended_by`/`ended_at` set from the caller; blocked for one's own linked employee record, mirroring `archiveEmployee`'s existing self-service restriction) and `rehireEmployee()` (opens a new period; fails if one is already open). `createEmployee()` is otherwise unchanged — a new `AFTER INSERT` trigger on `employees` opens each new employee's first period automatically from the hire date already in its existing payload.
- **Two DB-level guard triggers** on `employee_employment_periods`, enforced for every role, not just through the app: only two `UPDATE` shapes are ever legal (correct an open period's `start_date`, or close it — an already-closed period is immutable, satisfying the "not silently editable" requirement), and a new/corrected period can never start on or before the employee's own most recent prior period's end date.
- **`updateEmployee()`/the edit form** no longer accept `employmentStatus`/`startDate`/`endDate` at all — sending them would fail the column-privilege check outright. The create form keeps a hire-date field (seeds the first period); the edit form shows a note pointing to the new Employment tab instead.
- **UI**: `EndEmploymentDialog`/`RehireEmployeeDialog` (form dialogs, not plain confirms — collecting a reason/note is part of the requirement) and a new read-only **Employment** tab on the employee profile (`EmploymentHistoryTab`) listing every period, most recent first, with the relevant action surfaced at the top depending on whether the employee currently has an open period.
- **Backfill**: every pre-existing `employees` row got exactly one period at migration time, derived from its then-current `employment_status`/`start_date`/`end_date` (`terminated` → a closed period with `end_reason = 'other'`; anything else → an open period, since `inactive`/`on_leave` have no equivalent under this migration's binary active/terminated model going forward).
- **Deliberately out of scope, documented rather than silently decided**: `on_leave`/`inactive` remain valid `employment_status` enum values but are unreachable through any code path now — reserved for a possible future leave-of-absence feature; archiving/restoring a record stays completely independent of ending/starting employment (ending employment never auto-archives, rehiring never auto-restores); there is no UI to correct a closed period's data after the fact (the open-period `start_date` correction path is supported at the database level but nothing calls it yet).

**Acceptance criteria**
- Every employee has at least one `employee_employment_periods` row at all times, with at most one open (`end_date is null`) row per employee, enforced by a partial unique index.
- Ending an employee's employment records an end date, a reason, an optional note, who performed it, and when; the employee record, roles, and account are all untouched.
- Rehiring a previously-terminated employee creates a new period on the same `employees` row — the employee number, UUID, and role-assignment history are unchanged, and the previous period's data is preserved exactly as it was.
- `employees.employment_status`/`start_date`/`end_date` always match the employee's current-or-latest period; a direct `UPDATE employees SET employment_status = ...` from `authenticated` fails at the database, for every role.
- Editing an already-closed employment period, or deleting any employment period row, fails for every role.
- Existing employees were migrated into an initial employment period with no data loss and no manual intervention required.
- `npm run lint` and `npm run build` both pass with these changes in place.

## M8 — Projects & Team Management

**Status: implemented in code; not yet applied to the linked remote project.** Supersedes the originally-sketched "Projects & Locations" scope (a single `project_manager_id` column, no Teams, a `project_locations` work-area hierarchy) with the actual requirements: multiple Project Managers/HSEQ Managers/HSE Officers/Inspectors per project, a full Teams module inside every project, and assignment-driven visibility applied for the first time (previously only recorded as target design in [ROLES_AND_PERMISSIONS.md §2](./ROLES_AND_PERMISSIONS.md#2-multi-company-multi-role-model)). `project_locations` remains **not implemented** — deferred, see [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md#project_locations--tenant--not-implemented-this-milestone).

- **`projects`** (`supabase/migrations/20260728090000_projects_and_teams.sql`) — name, client, optional code (unique per company when present), description, status (`planning`/`active`/`completed`/`archived` — the status value itself is the retirement mechanism, no separate `deleted_at`), dates, location. No `DELETE` policy or grant at all.
- **`project_assignments`** — who currently (or previously) held a project-level capacity: the project's roster (`member`) and its Project Manager(s)/HSEQ Manager(s)/HSE Officer(s)/Inspector(s). An employee may hold several simultaneously (e.g. both `member` and `project_manager`); a `BEFORE INSERT` trigger rejects assigning a manager-tier role to an employee who doesn't already hold that same *company* role.
- **`teams`** — a crew within a project; colored (`team_color`, a fixed nine-value palette — the app stores the key, e.g. `blue`, never a hex value), optional code, description, status (`active`/`archived`), and a manually-set `display_order` (never alphabetical — see its column comment for why a plain integer future-proofs a drag-and-drop reorder UI with no schema change, which this milestone deliberately does not build).
- **`team_assignments`** — which team, if any, an employee currently belongs to *within a project*. At most one open row per `(project_id, employee_id)` — **not** per team — the literal expression of "one active team per project." Moving an employee is always close-then-insert, performed atomically by the new `move_employee_to_team()` SQL function (a single function call is one transaction by construction) — never an in-place `UPDATE` of `team_id` (blocked by a guard trigger, for every role).
- **Assignment-driven visibility, implemented for the first time**: `has_project_access()`/`is_project_manager()` (both `SECURITY DEFINER`, mirroring `is_company_member()`'s reasoning) back every RLS policy on `projects`/`project_assignments`/`teams`/`team_assignments`. Holding a project-scoped company role grants no project visibility by itself — only an explicit, currently-open assignment row does. Foreman is the one deliberate exception: their project visibility comes from `team_assignments` (`assignment_role = 'foreman'`), never a `project_assignments` row — see [ROLES_AND_PERMISSIONS.md §1](./ROLES_AND_PERMISSIONS.md#1-role-definitions)'s Foreman row.
- **A project/team-mate's basic employee info is resolved through `get_basic_employee_info()`, a narrow-column `SECURITY DEFINER` function — never a raw `employees` `SELECT` policy** (see the Review/Hardening Pass below for why this is a function, not a policy).
- **UI**: Team Cards, not a table — colored header, optional code, Foreman(s)/Members lists (current assignments only, never history), and a total member count. Empty teams render normally (`"No Foreman assigned" / "No Members assigned"`). A single create/edit dialog covers both General fields and Assignments (Foreman(s)/Members) in one place — assigning someone already on a different team in the same project moves them, shown as an "(in <team>)" note before the fact. `/projects` (card list, unpaginated at this milestone's expected scale), `/projects/new`, `/projects/[projectId]` (Overview/Teams/Assignments tabs — Equipment/Documents/Audit are explicit placeholders, same pattern as the employee profile page), `/projects/[projectId]/edit`.
- **Member rows carry an explicit, currently-unused `attendanceStatus` slot** (`modules/teams/components/team-card.tsx`'s `TeamMemberRow`) so a future Attendance module can render a status badge next to a name without restructuring the component — the Team module itself has no Attendance dependency.

### M8 Review/Hardening Pass

A dedicated architecture/database-security/edge-case review of this milestone, run before the migration was applied anywhere, found and fixed eight real defects in the first version (all in the same still-unapplied migration file, corrected in place — see its header comment for the numbered list):

1. **Employee data over-exposure (critical).** The first version granted project/team-mates a raw `employees` `SELECT` policy described as "basic record access." PostgreSQL RLS restricts rows, not columns — that policy actually exposed every column, including `work_email`/`phone`/`birth_date`/`employment_status`/`account_status`/`created_by`/`updated_by`, to any teammate. Replaced with `get_basic_employee_info()`, a `SECURITY DEFINER` function with its own per-row authorization check that returns only `id`/`first_name`/`last_name`/`position_title`/`profile_id`/`archived_at`. There is no longer any RLS policy granting teammates raw `employees` row access at all.
2. **No database-level company-boundary enforcement.** The first version relied on application code alone to keep a child row's `company_id`/`project_id` consistent with its parent. Added composite foreign keys throughout (`projects`/`teams`/`employees` each gained a `unique(id, company_id)` or `unique(id, project_id, company_id)`; `project_assignments`/`teams`/`team_assignments` now composite-FK against them) — a mismatch is now a constraint violation, not just a bug someone has to notice.
3. **No eligibility check on assignment.** Nothing stopped assigning a terminated, not-yet-started, or archived employee to a project or team. Added `assert_employee_eligible_for_assignment()`, called from both tables' `BEFORE INSERT` triggers.
4. **Ambiguous same-day-move semantics.** `team_assignments`/`project_assignments` used `date` columns; a same-day close-and-reopen had no unambiguous way to avoid looking simultaneously active (or overlapping) under date-only granularity. Switched to `timestamptz` (`start_at`/`end_at`), with `move_employee_to_team()` using one shared timestamp for both halves of a move.
5. **No overlap prevention beyond "at most one open row."** The original partial unique index prevented two simultaneously-*open* rows but not a new row starting before a prior *closed* row ended. Added `validate_*_no_overlap` triggers to both assignment tables.
6. **No archived-project/archived-team guard.** Nothing stopped creating a team inside an archived project, or a new assignment into an archived project or an archived team. Added `assert_project_not_archived()` and a team-status check, called from every relevant `BEFORE INSERT` trigger; archiving a team with open assignments is now rejected outright (not silently cascaded).
7. **Orphaned team assignments.** Removing an employee's last `project_assignments` row left them possibly still "actively on a team" with zero project standing. Added `close_orphaned_team_assignment()`, an `AFTER UPDATE` trigger that closes the matching `team_assignments` row automatically when that happens.
8. **Non-atomic Team dialog submit.** The Team dialog originally issued several separate Server Function calls (save team fields, then one call per changed assignment) — a partial failure could save the team but reject an assignment change, or move some members and not others. Added `save_team_with_assignments()` (wraps the whole submit in one transaction) and `reorder_teams()` (same fix for manual reordering).

See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md#project_assignments--tenant) for the corrected schema in full detail.

**Acceptance criteria**
- Project-scoped roles (PM/HM/HO/IN) only see projects they hold a current `project_assignments` row for; Foreman only sees projects they hold a current `team_assignments` row in; company-scoped roles (Company Manager/Workforce Coordinator) see every project in their active company; cross-company access is impossible (regression-tested against the M2 isolation test).
- A project/team-mate viewing another employee's info through the Team Cards or Assignments UI never receives `work_email`/`phone`/`birth_date`/`employment_status`/`account_status`, or any audit column — verified by inspecting `get_basic_employee_info()`'s actual return columns, not by reading a policy's comment.
- An employee can never hold two simultaneously-open `team_assignments` rows within the same project, enforced at the database level regardless of application logic; a new/reopened period can never start before that employee's own prior period (in the same project) ended.
- Moving an employee from Team A to Team B within the same project always results in exactly one open `team_assignments` row for them afterward, with Team A's row fully closed (`end_at`/`ended_by`/`ended_at` all set) — verified as an atomic operation (no intermediate state where they belong to zero or two teams is ever observable), and two concurrent move requests for the same employee never both succeed into different teams.
- Assigning an employee as a project's `hseq_manager` (or `hse_officer`/`inspector`) fails if they don't already hold that company role; assigning a terminated, not-yet-started, or archived employee to a project or team fails; assigning into an archived project or an archived team fails.
- Archiving a team with active assignments is rejected; removing an employee's last project assignment while they're still on a team automatically ends that team assignment too.
- The Team dialog's submit (team fields + every assignment change) either fully succeeds or fully fails — never a partial result.
- Team Cards render every team in a project in `display_order`, never alphabetically; an empty team still renders its own card; a Foreman is never duplicated as a separate "member" row, and is counted in the card's total.
- `npm run lint` and `npm run build` both pass with these changes in place.
- This project has no automated test runner configured (`package.json` has no `vitest`/`jest`/`playwright`) — the scenarios above (and the fuller list in the review) are verification checklists to run manually against a real Supabase project once this migration is applied, not executable test files.

#### M8 Final Correction — archived-team invariant

The Review/Hardening Pass's item 6 (archived-team guard) had one remaining gap: `save_team_with_assignments()` could still archive a team in the same submit as adding a new member, because the assignment change was applied and accepted (the team was still `active` at that moment) *before* the status change — so the standalone archive-with-open-assignments guard never saw the combination as a whole. Fixed by adding an upfront check inside `save_team_with_assignments()` that computes the requested **final** set of team members (current open assignments, minus everyone this submit sets to `'none'`, plus everyone this submit assigns/moves onto the team) *before* writing anything, and rejects with `"A team cannot be archived while it has assigned employees. Remove all current assignments first."` if that final set is non-empty and `target_status = 'archived'` — regardless of whether the function's internal create/update branches apply assignment changes before or after the status field. The database-level guards (`teams_validate_status_change`, `team_assignments_validate_insert`'s archived-team check) are unchanged and remain the backstop for any direct SQL or future code path that bypasses this function.

Added to the manual verification checklist:
- Adding a new member to a team while also setting its status to `archived` in the same Team dialog submit is rejected, with the message above.
- Archiving a team while, in the same submit, setting every one of its current members to `'none'` succeeds — the team ends up archived with zero open `team_assignments` rows.
- An archived team can never have an open `team_assignments` row, verified both through `save_team_with_assignments()` and via a direct `INSERT`/`UPDATE` attempt against `team_assignments`/`teams` (the trigger-level backstop).

## M9 — Daily Workforce Scheduling

- `schedule_entries` CRUD; Planner/Foreman build a day's crew list; Employee sees their own assignment.

**Acceptance criteria**
- The unique-active-assignment-per-day constraint is enforced and surfaces as a clear validation error in the UI, not a raw database error.
- Mobile view: an Employee can see "where am I today" in under two taps from login.

## M10 — Timesheets, Hour Discrepancy Requests & Payroll Export

- `timesheets` CRUD with draft → submitted → approved/rejected flow; `hour_discrepancy_requests` flow.
- CSV and Excel-friendly (XLSX) export of approved timesheets for a project/date range, for Company Admin — export-only, **no payroll-provider integration**.

**Acceptance criteria**
- An Employee can submit hours against their schedule entry from a phone in under 60 seconds for the common case (pre-filled from the schedule).
- A Foreman approving/rejecting hours produces an audit log entry with before/after values.
- A discrepancy request is resolvable end-to-end (open → in review → approved/rejected) with the timesheet updated on approval.
- Both the CSV and XLSX export for a sample project/date range open correctly in common spreadsheet software and match the underlying `timesheets` rows exactly (no silent rounding/truncation, correct column headers).

## M11 — Employee Documents, Certificates & Expiry Notifications

- `employee_documents` CRUD, file upload to Supabase Storage.
- `employees.manager_id` (direct manager assignment) — not part of the `employees` table as implemented in M7.6 (see [DATABASE_SCHEMA.md — Implementation Status](./DATABASE_SCHEMA.md#implementation-status), deviation 4); added here as a new column.
- Scheduled expiry-notification sweep (Vercel Cron → Route Handler) against `document_expiry_notification_log`, implementing the fixed default schedule and recipient set from [PRODUCT_REQUIREMENTS.md §7](./PRODUCT_REQUIREMENTS.md#7-certificate-expiry-notification-schedule).

**Acceptance criteria**
- A document nearing its `expiry_date` produces exactly one notification per milestone (60/30/14/7 days before, on expiry) to each of: the employee, their direct manager (if `manager_id` is set), everyone holding HSEQ Manager in the company, and everyone holding Company Admin in the company (`payroll_admin` was retired in the Role Catalogue & Permissions milestone with no direct replacement — see [PRODUCT_REQUIREMENTS.md §10, open question 4](./PRODUCT_REQUIREMENTS.md#10-open-product-questions)) — verified by seeding a document at each boundary date and running the sweep.
- The sweep does not re-send an already-sent one-time milestone (verified by running it twice for the same date).
- A document left expired and unresolved continues to produce a recurring notification at the defined interval, and stops once the document is renewed/replaced.
- File access is via signed URL; the storage bucket is confirmed private (a direct unauthenticated request to the object URL fails).

## M12 — Notifications (In-App)

- `notifications` table + UI; triggered by document expiry (M11), timesheet approval needed (M10), and later HSEQ events.

**Acceptance criteria**
- A relevant event (e.g., timesheet submitted) produces a notification visible to the correct recipient within the same session, without a page reload (via Supabase Realtime or client-side revalidation — implementation choice made at build time).

## M13 — HSEQ Shared Infrastructure: Event Categories, Attachments, Signatures, Corrective Actions

Built before the individual HSEQ forms (M14–M16) because incident/near-miss/observation classification, LMRA, toolbox talks, inspections, and safety walks all depend on it.

- `event_categories` seeded with the nine system categories via migration; Company Admin/HSEQ Manager UI to add/deactivate company-specific custom categories.
- `attachments`, `digital_signatures` (with `signer_name_snapshot`, `document_version`, `attestation_text`, and conditional `ip_address`/`user_agent` capture), `corrective_actions` tables and shared UI components (file upload widget, signature capture widget, "raise a corrective action from this record" action).

**Acceptance criteria**
- The nine system categories exist after running migrations on a fresh database and cannot be edited or deleted through the application by any role, including Company Admin and Platform Super Admin.
- An company can add a custom category and use it on an incident report; a *different* company cannot see or select that custom category (cross-tenant isolation applies to `event_categories` exactly as it does to any other tenant table).
- The signature capture widget produces a `digital_signatures` row with a populated `signer_name_snapshot` and `document_version`, that cannot subsequently be edited by anyone, including the signer (verified at RLS level).
- A corrective action can be raised from a stub/test HSEQ record and appears on the assignee's corrective-action list; attempting to raise one against a record in a different company is rejected by the cross-reference validation helper (M7), not just by RLS.

## M14 — LMRA & Toolbox Talks

**Acceptance criteria**
- A Foreman can run an LMRA or toolbox talk and capture attendee signatures for a full crew (5–15 people) in under 3 minutes on a phone.
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
- A user cannot select another company's custom category when filing an incident (system categories remain selectable by everyone).

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
- A production smoke test confirms a brand-new user, invited by a Platform-Super-Admin-provisioned Company Admin, can accept the invite, land in the correct company, and be blocked from every other company on the platform.

---

## Open Questions

These block the specific milestone noted, not the whole plan — work can proceed on everything before that point while they're resolved. Items resolved by the confirmed product decisions in this revision have been removed from this table (company membership model, role model, company onboarding path, payroll scope, incident severity scale, digital signature approach, and expiry notification schedule/recipients are no longer open).

| Question | Blocks | Owner needed |
|---|---|---|
| Regulatory recordability/reporting format beyond the internal category model (e.g., OSHA-style recordability), and for which jurisdictions | M16/M17 | HSEQ/Compliance stakeholder |
| Fixed two-level vs. arbitrary-depth Project Location hierarchy | M8 | Product (schema already supports arbitrary depth; this is a UX/scope question, not a blocker) |
| Who has Supabase project dashboard access to configure the Custom Access Token Auth Hook per environment | M2 | Whoever owns infra access — needs naming before M2 can be fully closed out, not before it can start |
| Now that `payroll_admin` is retired (Role Catalogue & Permissions milestone), is Company Admin alone the right default "designated administration recipient" set for expiry notifications, should a dedicated back-office role be reintroduced, or should it be a specific configurable individual | M11 | Product |
| Should HSEQ Manager be the sole role permitted to create custom incident/observation categories, or also Company Admin (current default: both) | M13 | Product |
