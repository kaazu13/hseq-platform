# Database Schema

This document specifies the PostgreSQL schema for Supabase. Most of it is still a design proposal to guide implementation milestones in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) — exact column lists may be refined in migration review, but the entities, relationships, and tenancy rules below should not change without updating this document first.

## Implementation Status

**Eight tables are implemented and migrated**: `organizations`, `profiles`, `organization_memberships`, `roles`, `membership_roles`, `audit_events`, `employees`, `organization_employee_number_counters`. The first six are the database-foundation milestone — auth, multi-org tenancy, multi-role authorization, and immutable audit evidence. `employees` (Employee Management Foundation) and `organization_employee_number_counters` (Employee Management Polish, alongside a new `employee_number_prefix` column on `organizations`) are built directly on top of that foundation: they reuse `organization_memberships`/`membership_roles`/`roles` as-is (no second role system for employees) and add `has_any_organization_role`, `search_employees`, `next_employee_number`/`allocate_employee_number` as the only new functions. Every other table in this document is still proposed, not built. **The first four employee migrations (through `20260725091300_audit_action_archive.sql`) have been applied to the linked remote Supabase project; everything from `20260726100000_employee_search.sql` onward has not** — see the Employee Management Polish milestone's implementation report for the exact list still to run. The migrations live in `supabase/migrations/`, in the order listed in each milestone's implementation report; `supabase/seed.sql` seeds the role catalogue and one example organization for local development. (This paragraph predates several later, additive milestones — Role Catalogue & Permissions, Platform User ID, Employment Lifecycle — each of which is documented in its own table/column section below and in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) rather than by rewriting the count here every time; as of Employment Lifecycle there are 19 migration files and a ninth implemented table, `employee_employment_periods` — see [Employment lifecycle](#employment-lifecycle-employee_employment_periods) below.)

Four deliberate deviations from the design as originally written here, applied consistently everywhere below:

1. **`roles` is a table, not an enum.** The original design used a `user_role` Postgres enum. It's now a proper reference table (`id`, `name`, `description`, `is_system`) that `membership_roles.role_id` foreign-keys into, so the catalogue can carry a description and be queried/joined normally. See [`roles`](#roles--tenant--implemented) below. Still a fixed, non-organization-configurable catalogue for v1 — the *mechanism* changed, not the product decision in [ROLES_AND_PERMISSIONS.md](./ROLES_AND_PERMISSIONS.md).
2. **`audit_logs` is named `audit_events`.** Purely a naming change; the design is otherwise unchanged. Every cross-reference in this document has been updated to match.
3. **RLS does not depend on an "active organization" JWT claim.** The original design (§8, preserved below as a documented future enhancement) resolves a single active organization from a Custom Access Token Auth Hook. That hook must be configured at the Supabase project/dashboard level — out of reach from a migration file, and still unconfigured (see the implementation report). Instead, the implemented helper functions (`is_organization_member(target_org_id)`, `has_organization_role(target_org_id, role_name)`, `has_any_organization_role(target_org_id, role_names)`) take an explicit organization id and check membership **per row**, for whichever organization that row belongs to. Tenant isolation is fully enforced either way; what the JWT-claim approach adds on top is convenience (not needing to pass an org id around) once that hook exists.
4. **`employee_profiles` is implemented as `employees`, with a smaller column set than originally proposed.** The proposed `supervisor_id`, `job_title`/`trade`, `employment_type`, and `emergency_contact_name`/`emergency_contact_phone` columns are not part of the implemented table — they're deferred to whichever future milestone actually needs them, not dropped from the design. The implemented table also splits status into **two** independent columns instead of the originally proposed single `status`: `employment_status` (`active`/`inactive`/`on_leave`/`terminated` — the employment relationship itself) and `account_status` (`draft`/`invited`/`pending_activation`/`active`/`suspended`/`archived` — the record's login/activation lifecycle, since an employee can exist with no linked account at all). See [`employees`](#employees--tenant--implemented) below. Every other proposed table in this document that references `employee_profiles(id)` now references `employees(id)` instead — a straight rename, since the referencing tables aren't built yet either.

`platform_super_admins` (below) is **not implemented** in this milestone — there is no self-service or in-app organization creation yet (see [PRODUCT_REQUIREMENTS.md §3](./PRODUCT_REQUIREMENTS.md#3-non-goals-initial-release)), so nothing yet needs to check for platform-super-admin status. Organizations are created directly via `supabase/seed.sql` (development) or an equivalent manual/service-role operation (staging/production), matching "manual organization onboarding for v1."

**Nothing in this milestone has been applied to a remote Supabase project.** No Supabase CLI project link exists in this environment; applying these migrations (`supabase db push`, after `supabase link`) is a manual step for whoever holds the project's credentials. See the implementation report for exactly what remains to be run.

Conventions used throughout:
- All primary keys are `uuid default gen_random_uuid()`.
- All timestamps are `timestamptz`.
- Every **tenant-owned** table has `organization_id uuid not null references organizations(id)`.
- Every tenant-owned table has audit columns: `created_at`, `created_by`, `updated_at`, `updated_by` (both `*_by` reference `profiles(id)`, nullable only for system/seed-inserted rows) — except where a table's own section says otherwise.
- Tables that need soft deletion add `deleted_at timestamptz null`.
- Any column referencing `profiles(id)` or using a polymorphic `entity_type`/`entity_id` (or `source_type`/`source_id`) pair is subject to the [Cross-Reference Validation Rule](./ARCHITECTURE.md#34-cross-reference-validation-rule) — a real FK, or an enum, only proves the target exists, not that it belongs to the right organization or that the caller may reference it. That check is the application's job.

## 1. Tenant Isolation Rule

> Every table below is tagged **[tenant]** (has `organization_id`, governed by RLS scoped to the caller's membership) or **[global]** (not tenant-owned; identity or platform-level).

The rule enforced by RLS on every **[tenant]** table, **as actually implemented** (see [§8.1](#81-as-implemented-this-milestone)):

```sql
-- read
using (public.is_organization_member(organization_id))
-- write
with check (public.is_organization_member(organization_id))
```

checked per row against whichever `organization_id` that row belongs to — there is no single cached "current organization" involved. The originally-proposed alternative — a single active organization resolved once from a JWT claim (`organization_id = current_org_id()`) — is preserved as a documented future enhancement in [§8.2](#82-original-design-future-enhancement-not-yet-built); it is not what's implemented. Either way, `organization_id` is never read off a `profiles` row — `profiles` doesn't carry one (see [ARCHITECTURE.md §3.2](./ARCHITECTURE.md#32-organization-membership-model)).

## 2. Enums

| Enum | Values |
|---|---|
| `membership_status` | `invited`, `active`, `suspended`, `removed` — status of an `organization_memberships` row. Replaces the earlier `user_status` (which lived on `profiles`; membership status is now per-organization, not global). **Implemented.** |
| `organization_status` | `trial`, `active`, `suspended`. **Implemented.** |
| `employment_type` | `full_time`, `part_time`, `contractor`, `temporary` — **not implemented**; not part of the `employees` table as built (see [Implementation Status](#implementation-status), deviation 4). Superseded for now by the simpler implemented `employment_status` below; may return as a real column in a future milestone. |
| `employment_status` | `active`, `inactive`, `on_leave`, `terminated` — the employment relationship itself. **Implemented**, used by `employees.employment_status`. Supersedes the originally proposed `employee_status` (below) — renamed and given an explicit `inactive` value. |
| `employee_status` | `active`, `on_leave`, `terminated` — **not implemented**; superseded by `employment_status` above. |
| `employee_account_status` | `draft`, `invited`, `pending_activation`, `active`, `suspended`, `archived` — the record's login/activation lifecycle, independent of `employment_status`. **Implemented**, used by `employees.account_status`. Not part of the original proposal — added because an employee record can exist with no linked account at all (see [Implementation Status](#implementation-status), deviation 4). |
| `project_status` | `planned`, `active`, `on_hold`, `closed` |
| `schedule_status` | `scheduled`, `confirmed`, `cancelled` |
| `timesheet_status` | `draft`, `submitted`, `approved`, `rejected` |
| `discrepancy_status` | `open`, `in_review`, `approved`, `rejected` |
| `document_type` | `identification`, `right_to_work`, `training_certificate`, `medical_clearance`, `induction`, `other` |
| `document_status` | `pending_review`, `valid`, `expiring_soon`, `expired`, `rejected` |
| `document_expiry_milestone` | `t_minus_60`, `t_minus_30`, `t_minus_14`, `t_minus_7`, `on_expiry`, `post_expiry_unresolved` — see [`document_expiry_notification_log`](#document_expiry_notification_log--tenant). |
| `lmra_result` | `go`, `no_go` |
| `risk_level` | `low`, `medium`, `high` — used for prospective risk assessment (LMRA, safety walk findings). Distinct from `hseq_severity` below, which is a retrospective severity/impact scale — kept as two separate enums since they answer different questions, even though both are ordered low→high scales. |
| `scaffold_tag_status` | `green`, `yellow`, `red` |
| `checklist_item_result` | `pass`, `fail`, `not_applicable` |
| `hseq_severity` | `low`, `medium`, `high`, `critical` — the confirmed four-level severity scale for Incident Reports and Near-Miss Reports. Replaces the earlier five-value `incident_severity` enum (`minor`/`moderate`/`serious`/`critical`/`fatality`). |
| `incident_status` | `reported`, `under_investigation`, `closed` |
| `involvement_role` | `injured`, `witness`, `involved` |
| `near_miss_status` | `reported`, `reviewed`, `closed` |
| `observation_type` | `positive`, `negative` |
| `observation_status` | `open`, `closed` |
| `corrective_action_status` | `open`, `in_progress`, `completed`, `verified` |
| `corrective_action_priority` | `low`, `medium`, `high`, `critical` |
| `hseq_source_type` | `scaffold_inspection`, `safety_walk`, `incident_report`, `near_miss_report`, `safety_observation`, `manual` |
| `attachment_entity_type` | one value per attachable entity (`incident_report`, `near_miss_report`, `safety_observation`, `scaffold_inspection`, `safety_walk`, `corrective_action`, `lmra_assessment`, `toolbox_talk`, `employee_document`) |
| `audit_action` | `create`, `update`, `delete`, `restore`, `approve`, `reject`, `sign`, `close`, `amend`, `archive`. **Implemented** — used by `audit_events` (renamed from `audit_logs`; see [Implementation Status](#implementation-status)). `archive` was added in its own migration (a Postgres enum value can't be added and used in the same transaction) for `employees.account_status` becoming `archived`. The pre-existing `restore` value (present since the enum was first created, previously unused by any Server Function) is now actually used — the Employee Management Polish milestone's `restoreEmployee` action is the first caller — so no further enum migration was needed for un-archiving. |

> **Removed from the earlier version of this document**: `user_status` (superseded by `membership_status`), `incident_type` (superseded by the configurable [`event_categories`](#event_categories--tenant--global-system-rows) table), and the `user_role` enum (superseded by the [`roles`](#roles--tenant--implemented) table — see [Implementation Status](#implementation-status)).

## 3. Core Tables

### `organizations` — **[global]**, tenant root — **Implemented**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text not null | |
| `slug` | text not null | **unique** — used in URLs/subdomains |
| `status` | `organization_status` not null default `trial` | |
| `employee_number_prefix` | text not null | **Implemented** (Employee Management Polish milestone). Permanent, uppercase, URL-safe (`^[A-Z0-9]+$`) prefix for this org's generated employee numbers — see [`employees` — Employee number generation](#employees--tenant--implemented). Changing `name` never changes this. |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz null | Only a Platform Super Admin action sets this (org offboarding); org data is retained, not purged, on deactivation. |

No `organization_id` column (it *is* the tenant root). **Created only by a Platform Super Admin in v1** — see [PRODUCT_REQUIREMENTS.md §3](./PRODUCT_REQUIREMENTS.md#3-non-goals-initial-release). Target RLS design: `INSERT`, and changes to `status`/`deleted_at`, are PSA-only; a `UPDATE` of ordinary settings columns (`name`, future config columns) is additionally allowed for a Company Admin of that org; `SELECT` is allowed for anyone with **any** `organization_memberships` row (any status) referencing this org, so an organization switcher can show its name even for a not-currently-active membership. See [§8](#8-row-level-security-approach).

**As implemented this milestone** (no `platform_super_admins` table yet — see below): `SELECT` is granted to any authenticated user with an **active** membership (`is_organization_member(id)`); there is no `INSERT`/`UPDATE`/`DELETE` policy for the `authenticated` role at all — organization creation and settings changes are a service-role/manual operation only (`supabase/seed.sql` for development). The "any status, not just active" nuance above and Company-Admin self-service settings updates are deferred along with `platform_super_admins`.

### `platform_super_admins` — **[global]** — Not implemented this milestone
| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid PK, references `auth.users(id)` | Allow-list of platform operators. Deliberately independent of `organization_memberships` — see [ARCHITECTURE.md §3.1](./ARCHITECTURE.md#31-tenant-boundary): Platform Super Admin access must not depend on ordinary tenant membership. |
| `created_at` | timestamptz | |

Deferred: there is no in-app or self-service organization creation yet for this table to gate (see [Implementation Status](#implementation-status)); building it is the natural next step once an actual Platform Super Admin onboarding flow is needed.

### `profiles` — **[global]**, identity only — **Implemented**
1:1 with `auth.users`. Holds **identity information only** — no organization, no role, no per-org status. Those live in `organization_memberships` / `membership_roles` below.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK, references `auth.users(id)` | Same id as the Supabase Auth user. Internal primary key / FK target only — never appears in a URL (see `user_number` below). |
| `full_name` | text not null | |
| `phone` | text null | |
| `active_organization_id` | uuid null, FK `organizations(id)` | UX preference only — which organization to default into. **Not** a security boundary; every RLS decision re-validates against `organization_memberships` regardless of this value. See [ARCHITECTURE.md §3.2](./ARCHITECTURE.md#32-organization-membership-model). |
| `user_number` | text not null, unique | **Implemented** (`supabase/migrations/20260726110000_profile_user_number.sql`). Permanent, globally unique, publicly-safe public identifier — format `USR-XXXXXXXX`, an 8-character random Crockford-Base32-style code (`0-9`, `A-Z` minus `I`/`L`/`O`/`U`). Generated automatically by `handle_new_user()` at signup via `generate_user_number()` (bounded retry-on-collision loop; the `unique` constraint is the real guarantee). Immutable once set (`profiles_prevent_user_number_change` trigger — same "RLS allows the row, a trigger blocks the specific column" pattern as `employees.employee_number`). Deliberately **random, not sequential**, unlike `employees.employee_number` — this identifier is platform-wide with no per-tenant RLS boundary narrowing who it identifies, so it must not be trivially enumerable. Entirely independent of any organization, membership, or employee record — a person keeps the same `user_number` for life even as their per-organization `employees.employee_number` differs in every organization they ever work for. Intended as the primary way a future Platform Super Admin area identifies/searches users platform-wide (`/platform/users/USR-...`); no such UI exists yet — this migration is database-only, since `profiles` rows are only ever created by `handle_new_user()`, never by application code directly. |
| `created_at` / `updated_at` | timestamptz | |

No `deleted_at` — a person's identity isn't "deleted" when they leave an organization; that's expressed by their `organization_memberships.status` becoming `removed`. No `created_by`/`updated_by` — "who invited this person" is tracked on the relevant `organization_memberships.created_by` instead, which is the meaningful attribution (an identity can be created by self-signup completing an invite, not by another user acting on the `profiles` row itself).

**Indexes**: `(active_organization_id)` — added preemptively in the actual migration rather than waiting for it to show up as a hot path; cheap on a table this shape, and the switcher's default-org lookup is a near-certain future query. `user_number`'s `unique` constraint carries its own backing index.

### `organization_memberships` — **[tenant]** — **Implemented**
Connects a `profiles` row to an `organizations` row. A person may hold memberships in more than one organization; at most one membership row per `(organization_id, user_id)` pair.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK `organizations(id)` | |
| `user_id` | uuid not null, FK `profiles(id)` | |
| `status` | `membership_status` not null default `invited` | `invited` → `active` on invite acceptance; `suspended` for a temporary block; `removed` for an ended membership. `removed` **is** this table's soft-delete equivalent — no separate `deleted_at` column, since the status enum already models "no longer a member" as a first-class state (see [ARCHITECTURE.md §9](./ARCHITECTURE.md#9-soft-deletion)). |
| `invited_at` | timestamptz null | |
| `joined_at` | timestamptz null | Set when status first becomes `active`. |
| `created_at` / `updated_at` / `created_by` / `updated_by` | | `created_by` is the admin (or Platform Super Admin, for an org's first Company Admin) who created the invite. |

**Constraints**: `unique (organization_id, user_id)`. **Indexes**: `(organization_id, status)`, `(user_id)` — the latter specifically to support "list every organization I belong to" without an organization filter, per [ARCHITECTURE.md §3.2](./ARCHITECTURE.md#32-organization-membership-model). Also indexed on `(created_at)` in the actual migration, for future admin/audit views ordered by recency.

### `roles` — **[tenant]** — **Implemented**
The fixed v1 role catalogue, implemented as a reference table rather than the `user_role` enum originally specified here — see [Implementation Status](#implementation-status) for why. All v1 rows are system-defined; not organization-configurable (matches [ROLES_AND_PERMISSIONS.md §1](./ROLES_AND_PERMISSIONS.md#1-role-definitions) exactly — the *mechanism* changed, not which roles exist or what they mean).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text not null | **unique** — the stable machine key every authorization check (RLS, `permissions.ts`) is written against: `platform_super_admin`, `company_admin`, `operations_manager`, `project_manager`, `hseq_manager`, `hse_officer`, `foreman`, `inspector`, `recruiter`, `planner`, `employee` — eleven rows, seeded by `supabase/seed.sql`. `supervisor` and `payroll_admin` were retired by the Role Catalogue & Permissions milestone (`supabase/migrations/20260726120000_role_catalogue_update.sql`) — see that migration's header for the safe retirement order (add replacements → migrate/remove existing assignments → delete the rows, relying on `membership_roles.role_id`'s `ON DELETE RESTRICT` as a final safety net). |
| `description` | text null | |
| `display_label` | text not null | **Implemented** (Role Catalogue & Permissions milestone). The human-facing name (e.g. `operations_manager` → "Workforce Coordinator") — deliberately independent of `name`, so a role can be relabeled without touching any authorization logic. Presentation-only; never read by RLS or `permissions.ts`. See [ROLES_AND_PERMISSIONS.md §1](./ROLES_AND_PERMISSIONS.md#1-role-definitions) for the current key→label mapping. |
| `is_system` | boolean not null default `true` | Every v1 row is system-defined; the column exists so a future org-custom-role feature (not in scope) has somewhere to record the distinction without a schema change. |
| `created_at` | timestamptz not null default now() | |

**Deletion behavior**: none through the application — not application-writable at all (no `INSERT`/`UPDATE`/`DELETE` RLS policy for `authenticated`); the catalogue is seed data. The two retired rows (`supervisor`, `payroll_admin`) were removed via a migration, not through the application, after every reference was safely cleared — see above. **Indexes**: `unique(name)` (also serves as the lookup index).

### `membership_roles` — **[tenant]** — **Implemented**
A membership can carry more than one role — a separate row per role, not a single column.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK `organizations(id)` | Denormalized from the parent membership for RLS simplicity/performance, same pattern used by other join tables in this schema (e.g., `lmra_participants`). |
| `membership_id` | uuid not null, FK `organization_memberships(id)` | |
| `role_id` | uuid not null, FK `roles(id)` on delete restrict | **Implemented as a foreign key to `roles`**, not an enum column (see [`roles`](#roles--tenant--implemented) above) — `ON DELETE RESTRICT` so a role in active use can't be removed from the catalogue out from under existing assignments. |
| `created_at` / `created_by` | | No `updated_at`/soft delete — a role grant is either present or removed (hard-deleted); there is nothing on this row to "edit." Removing a role is deleting the row, always audit-logged from the calling Server Function. |

**Constraints**: `unique (membership_id, role_id)`. **Indexes**: `(membership_id)`, `(organization_id)`, `(role_id)` — the latter two support "everyone holding role X in this org" (e.g., resolving HSEQ Manager notification recipients) and general role-catalogue joins.

## 4. Core Tables (continued)

### `employees` — **[tenant]** — **Implemented**
The company employment record for a person working for the org — see [PRODUCT_REQUIREMENTS.md §5.3](./PRODUCT_REQUIREMENTS.md#53-employees). Distinct from `profiles` because a worker may exist on the crew before (or without ever) getting platform login access, and because `profiles` is now a global identity table not scoped to this org. This is the only "who works here" record in the platform — no separate contractor/visitor/external-person table exists or is planned.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK `organizations(id) on delete cascade` | |
| `profile_id` | uuid null, FK `profiles(id) on delete set null` | Null until/unless the employee is linked to a platform login. `ON DELETE SET NULL` (not `CASCADE`) so the employment record survives even in the hypothetical case of the linked `profiles` row going away — an employee record must never disappear just because its account link did. Not subject to the cross-reference validation rule's "must have an active membership" clause in this milestone specifically because nothing in the implemented create/edit forms ever sets this column at all (account linking/activation is a future milestone) — a future milestone that lets the app itself set `profile_id` must add that check then. |
| `employee_number` | text not null | **Auto-generated, immutable, unique per org.** Format `<organizations.employee_number_prefix>-00001`. Generated by `next_employee_number()` (see below) at creation time — the create form has no editable field for it at all, and a `BEFORE UPDATE` trigger (`employees_prevent_number_change`) unconditionally rejects any attempt to change an already-set value, for every role. Was nullable through the Employee Management Foundation milestone (manually entered, optional); the Employee Management Polish milestone (supabase/migrations/20260726100100_employee_numbering.sql) backfilled every existing row and made the column `not null`. |
| `first_name` / `last_name` | text not null | Checked non-blank (`btrim(...) <> ''`). |
| `work_email` | text null | Checked lowercase (`work_email = lower(work_email)`) at the database level — application code normalizes before writing, and the constraint is a backstop against any other write path. |
| `phone` | text null | |
| `position_title` | text null | Free text — no fixed job-title/trade catalogue in this milestone (the originally proposed `job_title`/`trade` split is deferred, see [Implementation Status](#implementation-status), deviation 4). |
| `employment_status` | `employment_status` not null | active / inactive / on_leave / terminated — the employment relationship itself. **As of the Employment Lifecycle milestone, this is a derived snapshot, not directly writable.** `authenticated` has no `UPDATE` privilege on this column at all (column-level `REVOKE`/`GRANT`, see [Employment lifecycle](#employment-lifecycle-employee_employment_periods) below) — it is kept in sync by a trigger off `employee_employment_periods`, the single source of truth. Only `active` (an open period exists) and `terminated` (the latest period is closed) are reachable through that trigger today; `inactive`/`on_leave` remain valid enum values, reserved for a possible future leave-of-absence feature, but nothing sets them anymore. |
| `account_status` | `employee_account_status` not null default `draft` | draft / invited / pending_activation / active / suspended / archived — the record's login/**account/access** lifecycle. **Independent of `archived_at`** (see below) — kept deliberately decoupled so a future invitation/suspension/multi-company-access flow can move `account_status` through its own states without that ever being confused with, or substituting for, "is this employee record archived." |
| `birth_date` | date null | |
| `start_date` / `end_date` | date null | Checked `end_date >= start_date` when both are set. Same derived-snapshot status as `employment_status` above — mirrors the current-or-latest `employee_employment_periods` row for this employee, not directly `UPDATE`-able by `authenticated`. |
| `created_at` / `updated_at` / `created_by` / `updated_by` | | `created_by`/`updated_by` reference `profiles(id) on delete set null`. |
| `archived_at` | timestamptz null | **The authoritative signal for "is this employee record archived."** Set by `archiveEmployee()`, cleared by `restoreEmployee()`; the row itself is never deleted (no `DELETE` RLS policy exists at all — see [§8.1](#81-as-implemented-this-milestone)). `archiveEmployee()`/`restoreEmployee()` also set `account_status` to `'archived'`/`'draft'` respectively, as part of today's lifecycle convention, but **nothing reads `account_status` to decide whether a record is archived** — every archive-state check (default-list filtering, the Archive-vs-Restore button, `search_employees()`'s `include_archived` filter) reads `archived_at is null` / `archived_at is not null` directly. An earlier revision of this milestone used `account_status = 'archived'` for this decision; that was a correctness bug, not a style choice — `account_status` needs to vary independently of record-archival for future invitations, linked accounts, suspended access, employment history, and multi-company access (see [PRODUCT_REQUIREMENTS.md §11.2](./PRODUCT_REQUIREMENTS.md#112-one-global-identity-many-organization-scoped-employee-records)), and conflating the two would make that impossible later. |

Deferred to a future milestone, not part of the implemented table: `manager_id` (self-referencing direct-manager link), `job_title`/`trade` (currently one free-text `position_title` instead), `employment_type`, `emergency_contact_name`/`emergency_contact_phone`. Adding them later is a straightforward column addition, not a redesign.

**Constraints**: unique `(organization_id, employee_number)` (the original partial index, `where employee_number is not null`, still exists unchanged — harmless now that the predicate is always true rather than being dropped and recreated, per this milestone's "don't edit an already-applied migration" rule); partial unique `(organization_id, profile_id) where profile_id is not null` (an account can back at most one employee record per org); `first_name`/`last_name` non-blank; `work_email` lowercase; `end_date >= start_date`. **Indexes**: `(organization_id, account_status)`, `(organization_id, employment_status)`, `(organization_id, last_name, first_name)`, `(organization_id, archived_at)` (added by the correction pass — see [Employee search & pagination](#employee-search--pagination) below), `(profile_id)`.

**Deletion behavior**: no `DELETE` RLS policy and no `DELETE` grant to `authenticated` at all — matches [PRODUCT_REQUIREMENTS.md §5.3](./PRODUCT_REQUIREMENTS.md#53-employees)'s "never permanently delete" requirement categorically, not just by convention. "Deleting" an employee in the UI archives it (`archived_at` set); **restoring** it (**implemented**, Employee Management Polish milestone) clears `archived_at` and resets `account_status` to `draft` — the required fallback since no richer "status before archive" is stored anywhere. Restoring never touches `employee_number`, `id`, or any other field, and never creates/activates an `auth.users` row.

#### Employee number generation

Automatic, database-generated, and immutable — see supabase/migrations/20260726100000_employee_search.sql and 20260726100100_employee_numbering.sql (both still unapplied as of the correction pass below — see the implementation report).

- **`organizations.employee_number_prefix`** (`text not null`, added to the already-implemented `organizations` table — see that table's section above) — a permanent, uppercase, URL-safe (`^[A-Z0-9]+$`, enforced by a check constraint) prefix, e.g. `VALUTRIS`. Set once; renaming an organization's display name never changes it. Backfilled for every pre-existing organization by uppercasing and stripping non-`[A-Z0-9]` characters from `slug` (falling back to a deterministic `ORG<8 hex chars of id>` if that strips to nothing) — this already produces `VALUTRIS` for an organization whose slug is exactly `valutris`. A prior revision of this migration additionally ran a broad `UPDATE organizations SET employee_number_prefix = 'VALUTRIS' WHERE lower(name) LIKE 'valutris%'`; that was removed during the correction pass because a partial name match could silently repoint more than one organization onto the same prefix. If the real Valutris organization's slug turns out not to be exactly `valutris`, see the implementation report for the exact single-row manual `UPDATE ... WHERE id = '<confirmed-id>'` to run once its id/slug is confirmed — nothing in the migration guesses at it.
- **`organization_employee_number_counters`** — **[tenant]**, one row per organization (`organization_id` PK, `next_number integer not null default 1`, `updated_at`). No RLS policy and no grant to `authenticated`/`anon`/`PUBLIC` at all (explicit `revoke all ... from public, anon, authenticated` in the migration, on top of RLS being enabled+forced with zero policies) — this table has zero direct API surface; it is only ever touched from inside `allocate_employee_number()`. Chosen over deriving the next number from `count(*)`/`max(...)` over `employees` **at allocation time** because neither is safe under concurrent inserts (two concurrent counts can read the same value before either insert commits); a dedicated counter row updated via a single atomic `UPDATE ... RETURNING` is safe because Postgres row-level locking serializes concurrent updates to that one row. `max(...)` **is** used once, at migration time only, to correctly *initialize* this counter from pre-existing data — see the next bullet.
- **Counter initialization (the correction pass's fix)**: naively starting every organization's counter at 1 would re-issue a number that already exists on a legacy/manually-entered row (e.g. an existing `VALUTRIS-00001` would be handed out again to the next new employee). Before any backfill runs, the migration computes, per organization, the highest numeric suffix among its *existing* `employee_number` values that actually match `<that org's prefix>-<digits>`, and initializes `next_number` to one past that (or `1` if none match). Values that don't match that shape — malformed data, numbers issued under a different prefix, free text entered before this milestone existed — are excluded from that computation and left completely untouched; they're never candidates for "the highest number in use," and (since they're non-null) are never touched by the backfill either. A second, idempotent synchronization pass re-checks the same computation after backfill completes, as a safety net.
- **`allocate_employee_number(target_org_id uuid) returns text`** — `SECURITY DEFINER`, the unauthenticated-safe core allocator (reads the org's prefix, atomically increments its counter, formats `PREFIX-00001`). `revoke all ... from public, anon, authenticated` — not callable by any application role at all; the only callers are `next_employee_number()` below and the numbering migration's own backfill/initialization steps (which run as the migration owner, with no `auth.uid()` session to authorize against in the first place).
- **`next_employee_number(target_org_id uuid) returns text`** — `SECURITY DEFINER`; the real, RPC-exposed function, granted to `authenticated` only. Requires the caller to hold `company_admin` or `operations_manager` **via an active membership** in `target_org_id` (via `has_any_organization_role`, which itself requires `organization_memberships.status = 'active'` as part of its own check — verified by re-reading that function's definition; an `invited`/`suspended`/`removed` membership, or a role attached to one, can never authorize an allocation) — mirrors `employees_insert_managers` exactly, so number generation and the insert it feeds can never disagree about who's allowed to create an employee. Called once per `createEmployee` Server Function invocation (`modules/employees/actions.ts`); the returned number is then written directly into the `INSERT`.
- **`employees_prevent_number_change`** — a `BEFORE UPDATE` trigger (backed by `prevent_employee_number_change()`) that rejects any `UPDATE` where `employee_number` differs from its previous value, unconditionally, for every role — the same "don't rely on the application layer alone" pattern as `audit_events`' immutability trigger (see [§8 below](#8-audit-logging) reference in ARCHITECTURE.md). The application never sends `employee_number` on update at all (it isn't part of the edit form's schema), so this is pure defense in depth.

#### Employee search & pagination

- **`escape_ilike_pattern(input text) returns text`** — `IMMUTABLE`, granted to `authenticated` only. Escapes `\`, `%`, and `_` so a search token can be embedded in an `ILIKE ... ESCAPE '\'` pattern as **literal** text — without this, a user searching for a literal `%` or `_` would match "almost everything"/"any single character" instead. Backslash is escaped first, so the `%`/`_` escapes added afterward aren't themselves re-escaped.
- **`employee_matches_filters(e employees, search_term text, p_employment_status employment_status, p_account_status employee_account_status, include_archived boolean) returns boolean`** — `IMMUTABLE`, granted to `authenticated` only. The single shared filter predicate both functions below call, so a list's total count and its rows can never silently disagree about which rows match. `include_archived` here reads `archived_at is null`/`is not null` — never `account_status` (see the `employees` table section above). The multi-word search match is an AND-of-ORs over `unnest(regexp_split_to_array(...))`: every whitespace-separated word in `search_term` must match `first_name`, `last_name`, `employee_number`, or `work_email` on the same row (case-insensitive, each token passed through `escape_ilike_pattern()`) — this is what makes "john doe" (or "doe john" — word order doesn't matter) find an employee named John Doe without either column containing the literal two-word string, while still treating a literal `%`/`_` in the search box as literal text.
- **`search_employees(target_org_id uuid, search_term text, p_employment_status employment_status, p_account_status employee_account_status, include_archived boolean, page_limit integer default 25, page_offset integer default 0) returns table (id, employee_number, first_name, last_name, work_email, position_title, employment_status, account_status, profile_id, archived_at)`** — `SECURITY INVOKER` (deliberately, unlike the `SECURITY DEFINER` RLS helper functions elsewhere in this schema): performs a plain `select` against `employees`, so `employees`' own RLS policies (org isolation, "own record only" for a caller with no manager/read role) apply exactly as they would to any other query through this function. Returns a **narrow** column set — exactly what the employee list UI renders — rather than `setof employees`. Ordered deterministically by `(last_name, first_name, id)`, `id` as the final tie-breaker so employees sharing a name never produce unstable or duplicated paging. `page_limit` is clamped to `[1, 100]` inside the function itself (`least(greatest(page_limit, 1), 100)`) regardless of what's passed in — a second, database-level enforcement of the same page-size cap `lib/pagination.ts` applies on the server, so a caller invoking this RPC directly still can't request an unbounded page.
- **`count_employees(target_org_id uuid, search_term text, p_employment_status employment_status, p_account_status employee_account_status, include_archived boolean) returns bigint`** — same `SECURITY INVOKER`/RLS reasoning; a plain `count(*)` over an RLS-scoped select never exposes rows the caller couldn't otherwise see. Deliberately a **separate** function/query from `search_employees()`, not a `count(*) over()` window column appended to its result — a windowed count only appears on rows that are actually returned, so it silently disappears exactly when it's most needed (an out-of-range page returns zero rows, and with a window column, zero count information too). `modules/employees/queries.ts` calls this first, so an out-of-range requested page can be corrected (`lib/pagination.ts`'s `clampPage()`, applied via a real redirect in `app/(app)/employees/page.tsx`) **before** ever querying rows for it.

Pagination is offset/limit-based (`LIMIT`/`OFFSET` inside `search_employees()`), the standard, adequate strategy at this product's expected per-organization employee counts; cursor-based pagination is not used and isn't currently justified. Known tradeoff: like any offset-based pagination, a row inserted or archived between two page loads can cause a small amount of drift (a row appearing twice, or being skipped, across pages) under concurrent writes — acceptable for an internal, moderately-trafficked employee roster; would need reconsidering only if this list needed to support high-concurrency editing at large scale.

**Deferred, not enabled**: `pg_trgm` (trigram) indexes would meaningfully accelerate `ILIKE '%term%'` substring search at large row counts (an ordinary B-tree index cannot accelerate a leading-wildcard `LIKE`/`ILIKE` pattern at all). Not enabled in this pass — it requires `CREATE EXTENSION pg_trgm` (a project-level operation) and adds index-maintenance overhead, and at the expected scale of a single organization's employee roster (tens to low thousands of rows), a sequential scan over an already `organization_id`-filtered set is expected to perform adequately. Revisit if a specific organization's employee count grows large enough, or search latency is actually measured to be a problem — not before.

#### Employment lifecycle (`employee_employment_periods`)

**Implemented**, Employment Lifecycle milestone (`supabase/migrations/20260727090000_employment_periods.sql`) — see that migration's header comment for the full design rationale. A narrower, structured first slice of the broader future employment-history direction described in [PRODUCT_REQUIREMENTS.md §11.4](./PRODUCT_REQUIREMENTS.md#114-employment-history-implemented-narrower-than-originally-envisioned).

The **single source of truth** for "is this employee currently employed, and since/until when" — `employees.employment_status`/`start_date`/`end_date` (above) are a synced snapshot derived from this table, never the other way around. One row per continuous stretch of employment for a given `employees` row within this organization; an employee who leaves and is later rehired accumulates a second (third, ...) row here, never a second `employees` row — which is what makes `employee_number` reuse on rehire automatic rather than a special case.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK `organizations(id) on delete cascade` | Denormalized from `employee_id` for RLS/index simplicity, same pattern as `membership_roles.organization_id`. |
| `employee_id` | uuid not null, FK `employees(id) on delete cascade` | |
| `start_date` | date not null | Immutable once the period is closed; correctable while the period is still open (see the update-shape guard below) — but no UI exposes that correction path this milestone. |
| `end_date` | date null | **Null = this period is currently open** (the employee is presently employed under it). At most one open period per employee (`employee_employment_periods_one_open_per_employee`, a partial unique index on `employee_id where end_date is null`) — this is what structurally prevents a rehire while someone is still employed, and what guarantees "rehire" can never mean a second `employees` row. |
| `end_reason` | `employment_end_reason` null | resigned / terminated / layoff / end_of_contract / other. Required exactly when `end_date` is set (check constraint), never otherwise. |
| `end_note` | text null | Optional free-text detail alongside `end_reason`. |
| `ended_by` / `ended_at` | uuid FK `profiles(id) on delete set null` / timestamptz null | Who closed the period and when — set by `endEmployment()` (`modules/employees/actions.ts`). Null for the pre-existing rows the backfill below created, since there was no real actor to record for those. |
| `created_at` / `created_by` | timestamptz not null / uuid FK `profiles(id) on delete set null` | Who opened the period (initial hire or a later rehire). |
| `updated_at` | timestamptz not null | |

**Constraints**: `end_date is null or end_date >= start_date`; `end_date`/`end_reason` set together or not at all. **Indexes**: unique partial `(employee_id) where end_date is null` (the one-open-period rule above), `(employee_id, start_date desc)`, `(organization_id)`.

**Update is deliberately near-immutable** — a `BEFORE UPDATE` trigger (`validate_employment_period_update`/`employee_employment_periods_validate_update`) allows exactly two shapes and rejects everything else, for every role: (a) correcting the `start_date` of a still-**open** period, or (b) closing an open period (`end_date`/`end_reason` set, `start_date` unchanged). Editing an already-**closed** period, reopening one, or changing which employee/organization a row belongs to are all rejected unconditionally. A second `BEFORE INSERT OR UPDATE` trigger (`validate_employment_period_no_overlap`) additionally rejects a new or corrected `start_date` that falls on or before the employee's own most recent prior period's `end_date`, so history can never overlap itself. **No `DELETE` grant and no `DELETE` policy at all** — history is never removed, matching the `employees`/`audit_events` pattern.

**Sync mechanism**: `AFTER INSERT OR UPDATE` on this table fires `sync_employee_employment_snapshot()` (`SECURITY DEFINER`), which recomputes `employees.employment_status`/`start_date`/`end_date` from this employee's current-or-latest period. `authenticated` has had its blanket `UPDATE` grant on `employees` narrowed via column-level `REVOKE`/`GRANT` to exclude exactly these three columns — so the sync function (owned by a role the revoke doesn't target) is the *only* writer, regardless of RLS, closing off the "two independent sources of truth" problem this milestone exists to solve. A separate `AFTER INSERT` trigger on `employees` itself (`create_initial_employment_period`) opens every new employee's first period automatically, from whatever `start_date` `createEmployee()` supplied.

**RLS**: `employee_employment_periods_select` mirrors `employees_select_managers_or_own_record` exactly (same reader-role array, plus the employee's own linked record via a lookup on `employees.profile_id`). `employee_employment_periods_insert`/`_update` mirror `employees_insert_managers`/`_update_managers` (`company_admin`/`operations_manager` only) — see [§8.1](#81-as-implemented-this-milestone).

**Backfill**: every pre-existing `employees` row received exactly one period at migration time, derived from its then-current `employment_status`/`start_date`/`end_date` — `terminated` became a closed period (`end_reason = 'other'`, since the real historical reason was never captured under the old model); anything else became an open period (this migration's binary active/terminated model has no equivalent for a pre-existing `inactive`/`on_leave` row, so those are treated as currently employed going forward).

### `projects` — **[tenant]** — **Implemented**

**Implemented**, Projects & Team Management milestone (`supabase/migrations/20260728090000_projects_and_teams.sql`) — supersedes the design originally sketched here (which had a single, required, unique `code` and one `project_manager_id` FK column). The actual implementation deviates in three ways, all driven by the same principle already established for organization roles ("roles define capabilities; assignments define visibility" — [ROLES_AND_PERMISSIONS.md §2](./ROLES_AND_PERMISSIONS.md#2-multi-organization-multi-role-model)):

1. **`code` is optional**, not required — a partial unique index (`where code is not null`), the same shape as `employees.employee_number` before it became mandatory, rather than a plain `unique not null`.
2. **No `project_manager_id` column.** A project may have more than one Project Manager (and more than one HSEQ Manager, HSE Officer, Inspector) simultaneously — a single FK column can't express that. See [`project_assignments`](#project_assignments--tenant) below.
3. **No `address` column** (renamed conceptually to `location`, free text — no structured address fields requested) and **no `deleted_at`** — `status = 'archived'` is this table's retirement mechanism, not a separate soft-delete column (see the `project_status` enum's own comment in the migration for why one field is enough here, unlike `employees`' independent `archived_at`/`account_status` split).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK `organizations(id) on delete cascade` | Also carries a `unique (id, organization_id)` constraint (redundant with `id` alone, added specifically to let `teams`/`project_assignments` composite-FK against this table — see the Review/Hardening Pass note below). |
| `name` | text not null | Checked non-blank. |
| `client_name` | text null | |
| `code` | text null | **Unique per org when present** — `unique (organization_id, code) where code is not null`. Unlike `employees.employee_number`, never auto-generated; a manager types it in (or leaves it blank). |
| `description` | text null | |
| `status` | `project_status` not null default `planning` | `planning` / `active` / `completed` / `archived` — see point 3 above. **`completed` is not a lock state** — a completed project stays fully editable; only `archived` blocks new teams/assignments (see below). |
| `start_date` / `end_date` | date null | Checked `end_date >= start_date` when both are set. |
| `location` | text null | Free text — no structured address or location hierarchy in this milestone (the originally-proposed `project_locations` work-area hierarchy remains unbuilt — see below). |
| `created_at` / `updated_at` / `created_by` / `updated_by` | | |

**Constraints**: `name` non-blank; `end_date >= start_date` when both set; `unique (id, organization_id)`. **Indexes**: `(organization_id, status)`, unique partial `(organization_id, code) where code is not null`.

**Deletion behavior**: no `DELETE` RLS policy and no `DELETE` grant at all — `status = 'archived'` is the only retirement path, matching `employees`'/`audit_events`' "never permanently delete" convention. Archiving does **not** touch existing teams/assignments — it only blocks *new* ones (`assert_project_not_archived()`, called from `teams`/`project_assignments`/`team_assignments`' own `BEFORE INSERT` triggers below); history remains fully readable to anyone already authorized to see it.

**Review/Hardening Pass note (organization-boundary integrity)**: every child table below (`project_assignments`, `teams`, `team_assignments`) references this table via a **composite foreign key** on `(id, organization_id)` (or, for `team_assignments`, `(team_id, project_id, organization_id)` against `teams`), not a plain `references projects(id)`. This makes "a child row's `organization_id` doesn't match its parent's" a constraint violation at the database level, not just an application-layer bug — the first version of this migration relied on application code alone to keep these in sync.

### `project_assignments` — **[tenant]**

**Implemented**, Projects & Team Management milestone. Who currently (or previously) held a project-level capacity: the project's employee roster (`assignment_role = 'member'`) and its Project Manager(s)/HSEQ Manager(s)/HSE Officer(s)/Inspector(s). This is what "an employee is assigned to a project" means throughout this schema — deliberately separate from `team_assignments` below, which is about a specific team *within* a project an employee has already been rostered onto here. History is preserved (closing sets `end_at`/`ended_by`/`ended_at`; nothing is ever deleted); unlike `team_assignments`, an employee may hold several simultaneously-open rows here (e.g. both `member` and `project_manager`) — only an exact duplicate `(project, employee, role)` is prevented.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK `organizations(id) on delete cascade` | Denormalized from `project_id`, same pattern as `membership_roles.organization_id`. |
| `project_id` | uuid not null | Composite FK `(project_id, organization_id) references projects (id, organization_id)` — see the organization-boundary note under `projects` above. |
| `employee_id` | uuid not null | Composite FK `(employee_id, organization_id) references employees (id, organization_id)` — same reasoning; guarantees the assignee actually belongs to this organization. |
| `assignment_role` | `project_assignment_role` not null | `project_manager` / `hseq_manager` / `hse_officer` / `inspector` / `member`. Deliberately excludes `foreman` — a Foreman's project visibility comes from `team_assignments` instead (see that table's comment). |
| `start_at` / `end_at` | timestamptz not null / timestamptz null | **Timestamps, not dates** (Review/Hardening Pass — see below). `end_at is null` = currently active; this is the one, consistent "current" test used everywhere this table is queried. Checked `end_at >= start_at`. |
| `assigned_by` / `created_at` | uuid FK `profiles(id) on delete set null` / timestamptz not null | |
| `ended_by` / `ended_at` | uuid FK `profiles(id) on delete set null` / timestamptz null | |
| `notes` | text null | |

**Constraints**: unique partial `(project_id, employee_id, assignment_role) where end_at is null` (prevents an exact duplicate open assignment — does **not** prevent an employee holding several different open roles at once). **Indexes**: `(project_id) where end_at is null`, `(employee_id) where end_at is null`, `(organization_id)`.

**INSERT-time validation** — one trigger (`validate_project_assignment_insert`), three checks: (1) the project must not be `archived` (`assert_project_not_archived()`); (2) the employee must be currently employed (`employment_status = 'active'`) and not archived (`assert_employee_eligible_for_assignment()`) — an employee who has left, hasn't started, or was archived cannot be newly assigned; (3) a manager-tier `assignment_role` requires the assignee already hold that same *organization* role via `membership_roles` — a project assignment can grant no more authority than the assignee's organization role already allows. `member` is exempt from check (3). A second `BEFORE INSERT` trigger (`validate_project_assignment_no_overlap`) rejects a new row whose `start_at` falls before the employee's own prior row of the *same role* in the *same project* ended — closing the gap between "at most one open row" (the partial unique index) and "periods never overlap." A `BEFORE UPDATE` trigger (`validate_project_assignment_update`) allows only one legal change: closing an open row (`end_at`/`ended_by`/`ended_at`/`notes`) — an already-closed row can never be modified, and no field can be repointed. **No `DELETE` policy or grant** — history is preserved.

**Losing the last assignment (Review/Hardening Pass)**: an `AFTER UPDATE` trigger (`close_orphaned_team_assignment`) checks, every time a `project_assignments` row closes, whether that was the employee's *last* open row for this project — if so, it automatically closes their open `team_assignments` row for the same project too (using the same actor/timestamp). Without this, removing someone from a project's roster while they were still actively on one of its teams would leave them "orphaned": actively on a team with zero project standing, which the Team Assignment Selector's own eligibility rule is supposed to make impossible.

### `teams` — **[tenant]**

**Implemented**, Projects & Team Management milestone. A crew within a project — exactly one `project_id` per team. Never hard-deleted; `status = 'archived'` is the retirement path, same reasoning as `projects.status`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK `organizations(id) on delete cascade` | |
| `project_id` | uuid not null | Composite FK `(project_id, organization_id) references projects (id, organization_id)`. Also carries `unique (id, project_id, organization_id)` so `team_assignments` can composite-FK against *this* table and get "the assignment's `project_id` matches its own team's `project_id`" enforced in one constraint. |
| `name` | text not null | Checked non-blank. |
| `code` | text null | Optional, decorative — no uniqueness constraint (unlike `projects.code`). |
| `color` | `team_color` not null default `blue` | One of a **fixed, Google-Calendar-style palette** (gray/blue/green/yellow/orange/red/purple/cyan/brown) — the UI stores this key, never a hex value, so the rendered color can change centrally without a data migration, and the database itself rejects any value outside the fixed nine even if the client is bypassed. See `modules/teams/types.ts` for the key-to-Tailwind-class mapping. |
| `description` | text null | |
| `status` | `team_status` not null default `active` | `active` / `archived`. Archiving a team with any open (`end_at is null`) `team_assignments` row is **rejected outright** (`validate_team_status_change` trigger), not silently cascaded — a Project Manager must explicitly move or remove every current member first. New `team_assignments` rows cannot be created for an already-archived team (`validate_team_assignment_insert`) or inside an archived project (`assert_project_not_archived`). |
| `display_order` | integer not null default `0` | Manually set by a Project Manager (`reorder_teams()`, a SQL function — see below) — **never** derived from `name`/`created_at`, and the UI never sorts teams alphabetically. A plain integer, not a linked-list or fractional-index scheme, so a future drag-and-drop reorder UI can slot in by writing new integers through this same column with no schema change. |
| `created_at` / `updated_at` / `created_by` / `updated_by` | | |

**Constraints**: `name` non-blank; `unique (id, project_id, organization_id)`. **Indexes**: `(project_id, display_order)`, `(organization_id)`. **Deletion behavior**: no `DELETE` policy or grant — `status = 'archived'` only.

### `team_assignments` — **[tenant]**

**Implemented**, Projects & Team Management milestone. Which team, if any, an employee currently belongs to within a project. **At most one open row per `(project_id, employee_id)` — not per `(team_id, employee_id)`** — the literal database expression of "within one project, an employee may only belong to one active team at a time."

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK `organizations(id) on delete cascade` | |
| `project_id` | uuid not null | Denormalized from `team_id` — what makes the one-active-team-per-*project* index a single-column partial unique index below, and keeps the visibility RLS on `projects`/`employees` from needing an extra join through `teams`. Composite FK `(team_id, project_id, organization_id) references teams (id, project_id, organization_id)` — one constraint that guarantees `team_id` is real, AND that this row's `project_id`/`organization_id` exactly match that team's own (a `team_assignments` row can never claim a `project_id` other than its team's actual project). |
| `team_id` | uuid not null | See composite FK above. |
| `employee_id` | uuid not null | Composite FK `(employee_id, organization_id) references employees (id, organization_id)`. |
| `assignment_role` | `team_assignment_role` not null default `member` | `member` / `foreman`. A Foreman is a `team_assignments` row like any other — never duplicated as a separate "member" row for the same person/team. Team Card member counts (`modules/teams/components/team-card.tsx`) sum foremen **and** members together — "N Members" on a card means total headcount, matching the milestone brief's own worked example (1 foreman + 3 members shown as "4 Members"). |
| `start_at` / `end_at` | timestamptz not null / timestamptz null | **Timestamps, not dates** — see the Review/Hardening Pass note below. `end_at is null` = currently active; the one, consistent "current" test used everywhere (`has_project_access()`, `is_project_manager()`, `modules/teams/queries.ts`) — never a date/timestamp range comparison. |
| `assigned_by` / `created_at` | uuid FK `profiles(id) on delete set null` / timestamptz not null | |
| `ended_by` / `ended_at` | uuid FK `profiles(id) on delete set null` / timestamptz null | |
| `notes` | text null | |

**Constraints**: unique partial `(project_id, employee_id) where end_at is null`. **Indexes**: `(team_id) where end_at is null`, `(employee_id)`, `(project_id, employee_id)`, `(organization_id)`.

**Review/Hardening Pass — temporal model**: the *first* version of this migration used plain `date` columns for `start_date`/`end_date`. That left the "same-day move" case genuinely ambiguous under date-only granularity: closing the old assignment and opening the new one both dated "today" could, depending on how a query compared the boundary, make both rows look simultaneously active, or make the moment of transition unclear. Switched to `timestamptz` (`start_at`/`end_at`) so a move uses one exact instant for both halves — see `move_employee_to_team()` below. Combined with the no-overlap trigger's `>=` comparison (an equal boundary is adjacent, not overlapping) and "current" always meaning `end_at is null` (never a range comparison), a same-instant move is unambiguous: exactly one row is ever "current" for a given `(project, employee)`, with no gap and no double-count.

**INSERT-time validation** — one trigger (`validate_team_assignment_insert`): the project must not be archived, the target **team** must have `status = 'active'`, and the employee must be currently employed and not archived (same `assert_*` helpers `project_assignments` uses). A second trigger (`validate_team_assignment_no_overlap`) rejects a new row starting before the employee's own prior row *in the same project* (any team) ended — same reasoning as `project_assignments`' version, scoped to `(project, employee)` instead of `(project, employee, role)`, matching this table's "one active team per project" scope.

**Moving an employee between teams is always close-then-insert, never an in-place edit** — a `BEFORE UPDATE` trigger (`validate_team_assignment_update`) permits only closing an open row (`end_at`/`ended_by`/`ended_at`/`notes`); repointing `team_id`/`employee_id`, or editing an already-closed row, is rejected for every role. `move_employee_to_team(target_project_id, target_team_id, target_employee_id, target_role, target_notes)` (`SECURITY INVOKER`, granted to `authenticated`) is the one function that ever changes team membership: it closes the employee's current open assignment anywhere in the project (if any) and opens the new one, both using one shared timestamp, atomically — a single SQL function call is one transaction by construction. `select ... for update` locks the employee's existing open row for the transaction's duration, serializing two concurrent moves of the same employee; for a brand-new (first-ever) assignment, where there is no existing row to lock, the partial unique index makes the *losing* concurrent INSERT fail with a unique-violation (23505) rather than silently creating a duplicate — the application layer (`modules/teams/actions.ts`) surfaces this as a "someone else just changed this — refresh and try again" conflict, not a raw error. `end_team_assignment(target_project_id, target_employee_id)` is the companion for removing someone from a team entirely (closes without reopening). **No `DELETE` policy or grant** — history is preserved, and is intentionally never surfaced by the Team Cards UI, which only ever reads rows where `end_at is null` (`modules/teams/queries.ts`'s `listTeamsWithAssignments`).

**`save_team_with_assignments(target_team_id, target_project_id, target_name, target_code, target_color, target_description, target_status, target_assignments)`** (`SECURITY INVOKER`) — wraps the Team dialog's entire submit (create-or-update the team's own fields, then apply every assignment change) in one transaction, reusing `move_employee_to_team()`/`end_team_assignment()` internally. Added in the Review/Hardening Pass to close a real gap in the first version: the dialog previously issued several separate Server Function calls in sequence (save team, then one call per changed assignment), so "team saved but an assignment change failed," or "some members moved and others didn't," were both reachable states. `target_team_id = null` creates a new team. For an **update**, assignment changes are applied *before* the team's own status change, so archiving a team while also clearing its last members in the same dialog submit works correctly (the archive-with-open-assignments guard sees the already-cleared state). `reorder_teams(target_project_id, target_team_ids)` (`SECURITY INVOKER`) similarly writes every team's new `display_order` in one transaction rather than the application issuing N separate `UPDATE`s.

### `project_locations` — **[tenant]** — **not implemented this milestone**
Self-referencing to allow an optional hierarchy (Project → Zone → Work Area) without a fixed depth. Deferred — the Projects & Team Management milestone's `projects.location` is a single free-text field, not a structured hierarchy; this remains a future enhancement if/when work-area-scoped scheduling or HSEQ records need it.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | |
| `project_id` | uuid not null, FK `projects(id)` | |
| `parent_location_id` | uuid null, FK `project_locations(id)` | Null = top-level area of the project. |
| `name` | text not null | |
| `code` | text null | |
| `description` | text null | |
| `created_at` / `updated_at` / `created_by` / `updated_by` | | |
| `deleted_at` | timestamptz null | |

**Indexes**: `(organization_id, project_id)`, `(parent_location_id)`.

### `schedule_entries` — **[tenant]** (daily workforce scheduling)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | |
| `project_id` | uuid not null, FK `projects(id)` | |
| `location_id` | uuid null, FK `project_locations(id)` | |
| `employee_id` | uuid not null, FK `employees(id)` | |
| `scheduled_date` | date not null | |
| `shift_start` / `shift_end` | time null | |
| `role_on_site` | text null | Free text (e.g., "Rigger") — not a row from the `roles` catalogue. |
| `status` | `schedule_status` not null default `scheduled` | |
| `created_at` / `updated_at` / `created_by` / `updated_by` | | |
| `deleted_at` | timestamptz null | |

**Constraints**: `unique (employee_id, scheduled_date) where status <> 'cancelled' and deleted_at is null` — an employee has at most one active assignment per day. **Indexes**: `(organization_id, project_id, scheduled_date)`, `(employee_id, scheduled_date)`.

### `timesheets` — **[tenant]** (worked hours)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | |
| `employee_id` | uuid not null, FK `employees(id)` | |
| `project_id` | uuid not null, FK `projects(id)` | |
| `location_id` | uuid null, FK `project_locations(id)` | |
| `schedule_entry_id` | uuid null, FK `schedule_entries(id)` | Link back to the plan, when one existed. |
| `work_date` | date not null | |
| `clock_in` / `clock_out` | timestamptz null | |
| `break_minutes` | integer not null default 0 | |
| `total_hours` | numeric(5,2) not null | Computed at write time from clock in/out minus breaks (application-computed, not a generated column, so manually-entered hours are also supported). |
| `status` | `timesheet_status` not null default `draft` | |
| `approved_by` | uuid null, FK `profiles(id)` | |
| `approved_at` | timestamptz null | |
| `created_at` / `updated_at` / `created_by` / `updated_by` | | |
| `deleted_at` | timestamptz null | |

**Constraints**: `unique (employee_id, project_id, work_date) where deleted_at is null`. **Indexes**: `(organization_id, project_id, work_date)`, `(employee_id, work_date)`, `(status)`.

**Payroll export (v1)**: timesheets are exported read-only as CSV and Excel-friendly (XLSX) files, generated on demand by a Route Handler (see [API_CONVENTIONS.md §9](./API_CONVENTIONS.md#9-file-uploads) sibling section on downloads) directly from this table plus `employees`/`projects` for display fields. No separate "export batch" or payroll-provider-integration table exists in v1 — see [PRODUCT_REQUIREMENTS.md §3](./PRODUCT_REQUIREMENTS.md#3-non-goals-initial-release).

### `hour_discrepancy_requests` — **[tenant]**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | |
| `timesheet_id` | uuid not null, FK `timesheets(id)` | |
| `employee_id` | uuid not null, FK `employees(id)` | |
| `requested_by` | uuid not null, FK `profiles(id)` | |
| `original_hours` | numeric(5,2) not null | Snapshot of the timesheet value at request time. |
| `requested_hours` | numeric(5,2) not null | |
| `reason` | text not null | |
| `status` | `discrepancy_status` not null default `open` | |
| `resolved_by` | uuid null, FK `profiles(id)` | |
| `resolved_at` | timestamptz null | |
| `resolution_notes` | text null | |
| `created_at` / `updated_at` / `created_by` / `updated_by` | | |
| `deleted_at` | timestamptz null | |

**Indexes**: `(organization_id, status)`, `(timesheet_id)`.

### `employee_documents` — **[tenant]** (documents & certificates)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | |
| `employee_id` | uuid not null, FK `employees(id)` | |
| `document_type` | `document_type` not null | |
| `title` | text not null | Free text, e.g., "First Aid Certificate". |
| `file_path` | text not null | Supabase Storage object key. |
| `issued_date` | date null | |
| `expiry_date` | date null | Null = does not expire; excluded from the expiry-notification sweep. |
| `status` | `document_status` not null default `pending_review` | |
| `verified_by` | uuid null, FK `profiles(id)` | |
| `verified_at` | timestamptz null | |
| `created_at` / `updated_at` / `created_by` / `updated_by` | | |
| `deleted_at` | timestamptz null | |

**Indexes**: `(organization_id, expiry_date)` — critical for the compliance/expiry-notification query path. `(employee_id)`.

### `document_expiry_notification_log` — **[tenant]**
Deduplication/history log for the certificate-expiry notification sweep (see [PRODUCT_REQUIREMENTS.md §7](./PRODUCT_REQUIREMENTS.md#7-certificate-expiry-notification-schedule)). A scheduled job (Vercel Cron → Route Handler, per [ARCHITECTURE.md §13](./ARCHITECTURE.md#13-explicitly-deferred-avoid-premature-complexity)) runs daily, and for each `employee_documents` row with a non-null `expiry_date`, checks whether today matches one of the fixed default milestones (60/30/14/7 days before, on the expiry date) and — for the one-time milestones — writes a row here and fans out `notifications` to the employee, their `manager_id` (if any, via that employee's linked `user_id`), everyone holding `hseq_manager` in the org, and everyone holding `company_admin` in the org (`payroll_admin` was retired by the Role Catalogue & Permissions milestone with no direct replacement — this is the v1 default for "designated administration recipient" — see [PRODUCT_REQUIREMENTS.md §7](./PRODUCT_REQUIREMENTS.md#7-certificate-expiry-notification-schedule)).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | |
| `employee_document_id` | uuid not null, FK `employee_documents(id)` | |
| `milestone` | `document_expiry_milestone` not null | |
| `sent_at` | timestamptz not null default now() | |
| `created_at` | timestamptz not null default now() | |

**Constraints**: `unique (employee_document_id, milestone) where milestone <> 'post_expiry_unresolved'` — each one-time milestone fires exactly once per document. `post_expiry_unresolved` is exempt from that uniqueness (it recurs while the document remains expired and unrenewed); the job instead checks the most recent `post_expiry_unresolved` row for that document and only fires again after a fixed interval (e.g., 7 days) has passed. **Indexes**: `(employee_document_id, milestone)`, `(organization_id, sent_at)`.

**Deletion behavior**: no deletion — an immutable log of what was actually sent, useful for support/compliance ("did the employee get notified before their certificate lapsed").

> **Deferred**: the fixed milestone list and recipient set above are v1 defaults, not yet organization-configurable. A future `notification_rules` table (keyed by `organization_id` + `document_type`) is the natural extension point if per-org configuration is needed — not built now, per [ARCHITECTURE.md §13](./ARCHITECTURE.md#13-explicitly-deferred-avoid-premature-complexity).

### `notifications` — **[tenant]**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | |
| `recipient_user_id` | uuid not null, FK `profiles(id)` | |
| `type` | text not null | e.g., `document_expiring`, `timesheet_approval_needed`, `corrective_action_overdue`. |
| `title` | text not null | |
| `body` | text null | |
| `link_path` | text null | In-app relative path the notification points to. |
| `read_at` | timestamptz null | |
| `created_at` | timestamptz not null default now() | |

**Deletion behavior**: hard delete permitted (a user may dismiss their own notifications) — this table carries no compliance value, so it's the one operational tenant table without `deleted_at`/audit `*_by` columns (`document_expiry_notification_log` above is the record of *that* history, kept separately and immutably). **Indexes**: `(recipient_user_id, read_at)`.

## 5. HSEQ Tables

### `event_categories` — **[tenant + global system rows]**
Configurable classification used by Incident Reports (and optionally Safety Observations) — see [PRODUCT_REQUIREMENTS.md §6.6](./PRODUCT_REQUIREMENTS.md#66-incident-reports). A hybrid table: a fixed set of **system** rows (global, seeded by migration, `organization_id is null`) that every organization sees and cannot rename/remove, plus optional **custom** rows an organization adds for itself.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid null, FK `organizations(id)` | Null for system categories. |
| `system_key` | text null | Stable slug, set only for system categories: `incident`, `near_miss`, `unsafe_act`, `unsafe_condition`, `environmental_event`, `property_damage`, `first_aid_case`, `medical_treatment_case`, `lost_time_injury`. Null for custom categories. |
| `name` | text not null | Display name. |
| `description` | text null | |
| `is_system` | boolean not null default false | |
| `is_active` | boolean not null default true | Custom categories are deactivated, not deleted, once referenced — see Deletion behavior below. |
| `created_at` / `updated_at` / `created_by` / `updated_by` | | Null `created_by`/`updated_by` for migration-seeded system rows. |

**Constraints**: `check ((is_system and organization_id is null and system_key is not null) or (not is_system and organization_id is not null and system_key is null))`. `unique (system_key) where is_system`. `unique (organization_id, name) where not is_system`.

**Deletion behavior**: no delete for either kind — system rows are immutable seed data (not writable at runtime by anyone, including Platform Super Admin, only via a migration, so "stable system categories for reporting" holds structurally); custom rows are deactivated (`is_active = false`) rather than deleted once any record might reference them, to avoid breaking historical reports.

**Indexes**: `(organization_id)`, `(system_key)`.

## 6. HSEQ Tables (continued)

### `lmra_assessments` — **[tenant]** — IMPLEMENTED, `supabase/migrations/20260801090000_lmra.sql`
The table below reflects what was actually built, which deviates from the original proposal above in four deliberate ways (all documented in the migration's own header comment): `work_area` is plain text, not a `location_id` FK to a `project_locations` table (that table doesn't exist); `work_date` (date) + `shift` (text) are separate fields instead of a single `conducted_at` timestamp — matching how a crew actually schedules a shift's work, not just logs a moment; `created_by`/`created_at` naming instead of `conducted_by`/`conducted_at`, consistent with every other table's audit-column naming in this schema; there is no `risk_level` column, since the 12-item per-hazard checklist (`lmra_hazards`, below) already carries that detail at a finer grain than one summary enum could.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | |
| `project_id` | uuid not null, FK `projects(id)` (composite, `(id, organization_id)`) | Immutable after creation. |
| `work_area` | text not null | |
| `work_activity` | text not null | |
| `work_date` | date not null | |
| `shift` | text not null | |
| `responsible_foreman_id` | uuid not null, FK `employees(id)` (composite), `on delete restrict` | Deliberately not `set null` — an assessment must always name a responsible foreman, even a since-departed one. |
| `status` | `lmra_status` not null, default `'draft'` | `draft` → `submitted` → `approved`/`rejected` → (optionally back to `draft` to correct) → `archived` (terminal, HSE Manager only). |
| `result` | `lmra_result` not null, default `'go'` | `go` / `no_go`. |
| `stop_work_reason` | text null | Required by a CHECK constraint whenever `result = 'no_go'`. |
| `notes` | text null | |
| `created_at` / `created_by` / `updated_at` / `updated_by` | | |
| `submitted_at` / `submitted_by` | timestamptz / uuid, null | |
| `reviewed_at` / `reviewed_by` / `review_notes` | timestamptz / uuid / text, null | |
| `approved_at` | timestamptz null | Set only when `status` becomes `approved`. |
| `archived_at` / `archived_by` | timestamptz / uuid, null | |

**Deletion behavior**: no delete grant on this table at all — HSEQ evidence, never hard-deleted (matches the "Soft delete" row in §8's table below, superseded here by the richer `status` workflow rather than a `deleted_at` column).

### `lmra_hazards` — **[tenant]** — IMPLEMENTED (new table, not in the original proposal)
One row per `(lmra_assessment_id, hazard_type)` — exactly 12 rows per assessment, one for each of the fixed `lmra_hazard_type` enum values (working at height, falling objects, line of fire, manual material handling, lifting operations, mobile equipment/MEWP, weather conditions, access and egress, housekeeping, tools and equipment, simultaneous operations, other), auto-created by an `AFTER INSERT` trigger on `lmra_assessments` the moment the parent row is created — the client never inserts or deletes individual hazard rows, only updates the 12 that already exist (via the `save_lmra_hazards()` RPC).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | Denormalized, same rationale as `lmra_participants`. |
| `lmra_assessment_id` | uuid not null, FK `lmra_assessments(id)` | |
| `hazard_type` | `lmra_hazard_type` not null | |
| `is_applicable` | boolean not null, default `true` | |
| `controls` | text null | |
| `responsible_person_id` | uuid null, FK `employees(id)` (composite), `on delete set null` | |
| `controls_confirmed` | boolean not null, default `false` | |
| `other_description` | text null | Only meaningful when `hazard_type = 'other'`. |

**Constraints**: `unique (lmra_assessment_id, hazard_type)`. Editable only while the parent assessment is `draft` (`assert_lmra_assessment_is_draft()`).

### `lmra_participants` — **[tenant]** (join table) — IMPLEMENTED
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | Denormalized for RLS simplicity/performance (avoids a join through `lmra_assessments` in every policy). |
| `lmra_assessment_id` | uuid not null, FK `lmra_assessments(id)` | |
| `employee_id` | uuid not null, FK `employees(id)` (composite) | |

**Constraints**: `unique (lmra_assessment_id, employee_id)`. Editable only while the parent assessment is `draft`, same as `lmra_hazards`. `signature_id`/digital-signature attestation from the original proposal is deferred — `digital_signatures` isn't built yet (see §8.2).

### `toolbox_talks` — **[tenant]**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | |
| `project_id` | uuid not null, FK `projects(id)` | |
| `location_id` | uuid null, FK `project_locations(id)` | |
| `topic` | text not null | |
| `presented_by` | uuid not null, FK `profiles(id)` | |
| `presented_at` | timestamptz not null | |
| `notes` | text null | |
| `created_at` / `updated_at` / `created_by` / `updated_by` | | |
| `deleted_at` | timestamptz null | |

### `toolbox_talk_attendees` — **[tenant]** (join table)
Same shape as `lmra_participants`: `id`, `organization_id`, `toolbox_talk_id` FK, `employee_id` FK, `signature_id` FK null. `unique (toolbox_talk_id, employee_id)`.

### `scaffold_inspections` — **[tenant]**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | |
| `project_id` | uuid not null, FK `projects(id)` | |
| `location_id` | uuid not null, FK `project_locations(id)` | The scaffold's work area. |
| `inspected_by` | uuid not null, FK `profiles(id)` | |
| `inspected_at` | timestamptz not null | |
| `tag_status` | `scaffold_tag_status` not null | |
| `next_inspection_due` | date null | |
| `notes` | text null | |
| `created_at` / `updated_at` / `created_by` / `updated_by` | | |
| `deleted_at` | timestamptz null | |

**Indexes**: `(organization_id, next_inspection_due)` for due-inspection dashboards.

### `scaffold_inspection_items` — **[tenant]** (checklist line items)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | Denormalized, same rationale as `lmra_participants`. |
| `scaffold_inspection_id` | uuid not null, FK `scaffold_inspections(id)` | |
| `item_description` | text not null | |
| `result` | `checklist_item_result` not null | |
| `notes` | text null | |

### `safety_walks` — **[tenant]**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | |
| `project_id` | uuid not null, FK `projects(id)` | |
| `location_id` | uuid null, FK `project_locations(id)` | |
| `conducted_by` | uuid not null, FK `profiles(id)` | |
| `conducted_at` | timestamptz not null | |
| `summary` | text null | |
| `created_at` / `updated_at` / `created_by` / `updated_by` | | |
| `deleted_at` | timestamptz null | |

### `safety_walk_findings` — **[tenant]**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | |
| `safety_walk_id` | uuid not null, FK `safety_walks(id)` | |
| `description` | text not null | |
| `severity` | `risk_level` not null | Prospective risk at time of finding — see the `risk_level` vs. `hseq_severity` note in [§2](#2-enums). |
| `corrective_action_id` | uuid null, FK `corrective_actions(id)` | Set once a finding is escalated to a tracked action. |

### `incident_reports` — **[tenant]**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | |
| `project_id` | uuid null, FK `projects(id)` | Nullable — an incident may occur outside a specific project context (e.g., office). |
| `location_id` | uuid null, FK `project_locations(id)` | |
| `category_id` | uuid not null, FK `event_categories(id)` | Replaces the earlier fixed `incident_type` enum — see [`event_categories`](#event_categories--tenant--global-system-rows). The FK guarantees the category *exists*; the [cross-reference validation rule](./ARCHITECTURE.md#34-cross-reference-validation-rule) still applies to confirm it's either a system category or belongs to this record's `organization_id` (a real FK alone doesn't prove the latter). |
| `reported_by` | uuid not null, FK `profiles(id)` | |
| `occurred_at` | timestamptz not null | |
| `discovered_at` | timestamptz null | |
| `severity` | `hseq_severity` not null | |
| `description` | text not null | |
| `immediate_actions_taken` | text null | |
| `status` | `incident_status` not null default `reported` | |
| `investigation_summary` | text null | |
| `closed_by` | uuid null, FK `profiles(id)` | |
| `closed_at` | timestamptz null | |
| `created_at` / `updated_at` / `created_by` / `updated_by` | | |
| `deleted_at` | timestamptz null | Regulatory record — never hard-deleted; deletion is restricted to Company Admin/HSEQ Manager and always audit-logged. |

**Indexes**: `(organization_id, status)`, `(organization_id, severity, occurred_at)`, `(category_id)`.

### `incident_involved_persons` — **[tenant]**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | |
| `incident_report_id` | uuid not null, FK `incident_reports(id)` | |
| `employee_id` | uuid null, FK `employees(id)` | Null if the person is not an employee (e.g., visitor). |
| `external_person_name` | text null | Used when `employee_id` is null. |
| `involvement_role` | `involvement_role` not null | |

**Check constraint**: exactly one of `employee_id` / `external_person_name` is set.

### `near_miss_reports` — **[tenant]**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | |
| `project_id` | uuid null, FK `projects(id)` | |
| `location_id` | uuid null, FK `project_locations(id)` | |
| `reported_by` | uuid not null, FK `profiles(id)` | |
| `occurred_at` | timestamptz not null | |
| `description` | text not null | |
| `potential_severity` | `hseq_severity` not null | Uses the same four-level scale as Incident Reports (renamed from `incident_severity`, see [§2](#2-enums)), for consistent reporting/trend analysis. |
| `status` | `near_miss_status` not null default `reported` | |
| `reviewed_by` | uuid null, FK `profiles(id)` | |
| `reviewed_at` | timestamptz null | |
| `created_at` / `updated_at` / `created_by` / `updated_by` | | |
| `deleted_at` | timestamptz null | |

`near_miss_reports` intentionally does **not** reference `event_categories` — the table itself already unambiguously means "near miss" (one of the nine system categories). Adding a redundant category pointer here would only matter if a near-miss needed finer sub-classification than that; not a requirement today.

### `safety_observations` — **[tenant]**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | |
| `project_id` | uuid null, FK `projects(id)` | |
| `location_id` | uuid null, FK `project_locations(id)` | |
| `observed_by` | uuid not null, FK `profiles(id)` | |
| `observed_at` | timestamptz not null | |
| `observation_type` | `observation_type` not null | |
| `category_id` | uuid null, FK `event_categories(id)` | Replaces the earlier free-text `category` column. Typically `unsafe_act` or `unsafe_condition` for negative observations; nullable since a quick positive observation may not need one. Same cross-reference validation as `incident_reports.category_id`. |
| `description` | text not null | |
| `status` | `observation_status` not null default `open` | |
| `created_at` / `updated_at` / `created_by` / `updated_by` | | |
| `deleted_at` | timestamptz null | |

### `corrective_actions` — **[tenant]**
The connective tissue across HSEQ modules — a remediation task that can be raised from any HSEQ source, or manually.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | |
| `project_id` | uuid null, FK `projects(id)` | |
| `source_type` | `hseq_source_type` not null default `manual` | |
| `source_id` | uuid null | **Not a DB-enforced FK** — see [Polymorphic references](#polymorphic-references-corrective_actionssource_id-attachmentsentity_id-digital_signaturesentity_id) below. |
| `description` | text not null | |
| `assigned_to` | uuid not null, FK `profiles(id)` | Cross-reference validation rule applies. |
| `priority` | `corrective_action_priority` not null default `medium` | |
| `due_date` | date not null | |
| `status` | `corrective_action_status` not null default `open` | |
| `completed_by` | uuid null, FK `profiles(id)` | |
| `completed_at` | timestamptz null | |
| `verified_by` | uuid null, FK `profiles(id)` | |
| `verified_at` | timestamptz null | |
| `evidence_notes` | text null | |
| `created_at` / `updated_at` / `created_by` / `updated_by` | | |
| `deleted_at` | timestamptz null | |

**Indexes**: `(organization_id, status, due_date)` — the primary dashboard query. `(assigned_to, status)`. `(source_type, source_id)`.

> **"Overdue" is not a stored status.** It's derived at query/display time from `due_date < now() and status not in ('completed','verified')`, to avoid a background job needed purely to keep a status column in sync.

### `attachments` — **[tenant]**
Shared attachment capability used by any HSEQ (and some operational) record.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | |
| `entity_type` | `attachment_entity_type` not null | |
| `entity_id` | uuid not null | **Not a DB-enforced FK** — see below. |
| `file_path` | text not null | Supabase Storage object key, namespaced `organization_id/entity_type/entity_id/...`. |
| `file_name` | text not null | |
| `mime_type` | text not null | |
| `file_size_bytes` | bigint not null | |
| `uploaded_by` | uuid not null, FK `profiles(id)` | |
| `uploaded_at` | timestamptz not null default now() | |
| `deleted_at` | timestamptz null | Evidence — soft delete only. |

**Indexes**: `(organization_id, entity_type, entity_id)`.

#### Polymorphic references (`corrective_actions.source_id`, `attachments.entity_id`, `digital_signatures.entity_id`)

These columns intentionally reference "one of several possible tables" and therefore cannot carry a native Postgres foreign key. This is a deliberate tradeoff:
- **Pro**: one `attachments`/`corrective_actions`/`digital_signatures` table instead of nine-plus near-identical join tables (one per attachable/actionable/signable entity), which keeps upload UI, storage-path logic, and dashboard queries uniform.
- **Con**: referential integrity for these columns is **not** enforced by the database — it is enforced entirely by the application, per the [Cross-Reference Validation Rule](./ARCHITECTURE.md#34-cross-reference-validation-rule). Concretely, every Server Function that writes one of these columns must, before the write:
  1. Confirm `entity_type`/`source_type` is one of the values valid for that column's enum.
  2. Load the referenced row by `entity_id`/`source_id` and confirm it actually exists.
  3. Confirm the referenced row's `organization_id` matches this record's `organization_id`.
  4. Confirm the acting user has permission (per [ROLES_AND_PERMISSIONS.md](./ROLES_AND_PERMISSIONS.md)) to attach/act on/sign that specific record — not merely that they can create rows in this table in general.
  Orphaned rows are only possible if a source record is hard-deleted, which the soft-deletion rule in this schema prevents for every source table involved.
- If a specific source entity ever needs a guaranteed DB-level FK (e.g., for a regulatory audit requirement), that source can be split out into its own dedicated join table without affecting the others.

### `digital_signatures` — **[tenant]**
Immutable **authenticated electronic attestation** record (not a certified/qualified e-signature — see [PRODUCT_REQUIREMENTS.md §6.10](./PRODUCT_REQUIREMENTS.md#610-digital-signatures)), referenced by `lmra_participants`, `toolbox_talk_attendees`, and any other sign-off point (e.g., incident report submission, corrective action verification) via their own FK to this table.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | |
| `signer_id` | uuid not null, FK `profiles(id)` | |
| `signer_name_snapshot` | text not null | The signer's name **at the time of signing**, copied from `profiles.full_name`. Identity data can change later; the attestation must not — this is what makes the record independently meaningful even if the `profiles` row is later edited. |
| `entity_type` | `attachment_entity_type` not null | Reuses the same enum as `attachments` for consistency. |
| `entity_id` | uuid not null | Polymorphic, same rationale and validation rule as `attachments.entity_id` above. |
| `attestation_text` | text not null | The statement the signer accepted, e.g., "I attended this toolbox talk and understood the content." |
| `document_version` | text not null | Version identifier of the document/form being attested to (e.g., a toolbox-talk template version, or an incident report's content hash/revision at submission time), so a later change to the underlying form doesn't retroactively make an old signature ambiguous about what was actually agreed to. |
| `signature_data` | text not null | Rendered image reference (Storage key) or vector stroke data. |
| `signed_at` | timestamptz not null default now() | |
| `ip_address` | inet null | Captured **where legally appropriate** for the org's jurisdiction — nullable so the app can omit it where capturing it would be inappropriate rather than storing a meaningless placeholder. |
| `user_agent` | text null | Same "where appropriate" treatment as `ip_address`. |

**Deletion behavior**: none. No `deleted_at`, no `UPDATE`/`DELETE` RLS policy granted to any role — a signature is permanent evidence, per [ARCHITECTURE.md §8](./ARCHITECTURE.md#8-audit-logging). A mistaken signature is addressed by a new record (e.g., re-attesting, or a corrective note referencing this signature's `id`), never by editing this row. **Indexes**: `(organization_id, entity_type, entity_id)`, `(signer_id)`.

### `audit_events` — **[tenant]** (append-only) — **Implemented**
Renamed from `audit_logs` in the original proposal — see [Implementation Status](#implementation-status).
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid null, FK, `on delete set null` | Null only for platform-level actions (e.g., Platform Super Admin suspending an org). `SET NULL` rather than `CASCADE` — a hard delete elsewhere should never silently delete audit evidence. |
| `actor_user_id` | uuid null, FK `profiles(id)`, `on delete set null` | Null for system/scheduled-job actions. |
| `action` | `audit_action` not null | |
| `entity_type` | text not null | |
| `entity_id` | uuid not null | |
| `changes` | jsonb null | Before/after diff where practical. |
| `ip_address` | inet null | |
| `created_at` | timestamptz not null default now() | |

**Deletion behavior**: none — no `UPDATE`/`DELETE` RLS policy for any role, including Company Admin, per [ARCHITECTURE.md §8](./ARCHITECTURE.md#8-audit-logging) — **and, as implemented, backed by a second, independent layer**: a hard `BEFORE UPDATE`/`BEFORE DELETE` trigger unconditionally rejects both operations regardless of role, so even `service_role`/`postgres` (which bypass RLS entirely) cannot alter history through normal DML. **Indexes**: `(organization_id, created_at desc)`, `(entity_type, entity_id)`, `(actor_user_id)`, `(created_at)`.

## 7. Deletion Behavior Summary

| Table | Deletion behavior | Rationale |
|---|---|---|
| `organizations` | Soft delete, Platform Super Admin only | Tenant offboarding retains data for compliance/export. |
| `profiles` | **No deletion** (identity persists) | A person's identity isn't tied to any one organization; membership end is expressed via `organization_memberships.status = 'removed'`, not a `profiles` deletion. |
| `organization_memberships` | **Status-based** (`status = 'removed'`), no separate `deleted_at` | The status enum already models "no longer a member" as a state — see [ARCHITECTURE.md §9](./ARCHITECTURE.md#9-soft-deletion). |
| `roles` | **No delete** — not application-writable | Fixed system catalogue, seeded once. |
| `membership_roles` | Hard delete | A role grant is present or absent; removing one is deleting the row, audit-logged by the caller. **Implemented**: RLS now grants `INSERT`/`DELETE` (previously fully deferred) — see [§8.1](#81-as-implemented-this-milestone). |
| `employees` | **No deletion at all** — no `DELETE` RLS policy, no `DELETE` grant | Employment history, and (once built) linked timesheets/HSEQ records, must be retained. "Deleting" in the UI archives (`account_status = 'archived'`, `archived_at` set); restoring (also **implemented**) reverses that via the same `UPDATE` policy — there is no separate restore-specific RLS policy since restore is just another `UPDATE` a `company_admin`/`operations_manager` is already permitted to make. `employee_number` is separately immutable regardless of role, enforced by `employees_prevent_number_change` (a hard trigger, not an RLS policy). **Implemented.** As of the Employment Lifecycle milestone, `employment_status`/`start_date`/`end_date` are additionally locked down at the column-privilege level — see the `employee_employment_periods` row below. |
| `employee_employment_periods` | **No deletion at all** — no `DELETE` RLS policy, no `DELETE` grant. `UPDATE` is restricted to two shapes by a hard trigger regardless of role (correcting an open period's `start_date`, or closing it) — an already-closed period can never be modified. | Employment-period history must not be silently editable or removable by ordinary organization users — see [PRODUCT_REQUIREMENTS.md §5.3](./PRODUCT_REQUIREMENTS.md#53-employees). **Implemented.** |
| `projects` | Soft delete | Closed projects remain queryable for reporting/compliance. |
| `project_locations` | Soft delete | Referenced by historical schedule/HSEQ records. |
| `schedule_entries` | Soft delete | Historical scheduling record. |
| `timesheets` | Soft delete | Payroll/compliance record. |
| `hour_discrepancy_requests` | Soft delete | Audit trail of pay disputes. |
| `employee_documents` | Soft delete | Compliance record even after expiry/replacement. |
| `document_expiry_notification_log` | **No deletion** | Immutable record of what notifications were actually sent. |
| `notifications` | **Hard delete permitted** | No compliance value; user-dismissible. |
| `event_categories` | **No delete** — system rows immutable seed data; custom rows deactivated (`is_active = false`) | Preserves "stable system categories for reporting"; avoids breaking historical reports that reference a custom category. |
| `lmra_assessments`, `toolbox_talks`, `scaffold_inspections`, `safety_walks`, `incident_reports`, `near_miss_reports`, `safety_observations`, `corrective_actions` | Soft delete | HSEQ evidence — never hard-deleted; correction of a *finalized* record is a new linked record/amendment, not an edit, per [ARCHITECTURE.md §8](./ARCHITECTURE.md#8-audit-logging). |
| `attachments` | Soft delete | Evidence. |
| `digital_signatures` | **No deletion at all** | Immutable attestation. |
| `audit_events` | **No deletion at all** — enforced by RLS *and* a hard trigger | Immutable system record. |
| Join/line-item tables (`lmra_participants`, `toolbox_talk_attendees`, `scaffold_inspection_items`, `safety_walk_findings`, `incident_involved_persons`) | Hard delete tied to parent lifecycle | Not independently meaningful without the parent; parent soft-delete is what matters for retention. |

## 8. Row Level Security Approach

### 8.1 As implemented (this milestone)

Three RLS helper functions exist, all `SECURITY DEFINER`, `STABLE`, and with `search_path` pinned to `public, pg_temp` (blocks search_path-hijacking against a definer-privileged function — the classic escalation vector for this pattern):

- **`is_organization_member(target_org_id uuid) returns boolean`** → true if the caller has an **active** `organization_memberships` row for `target_org_id`.
- **`has_organization_role(target_org_id uuid, role_name text) returns boolean`** → true if the caller has an active membership in `target_org_id` **and** holds `role_name` there (via `membership_roles` → `roles`).
- **`has_any_organization_role(target_org_id uuid, role_names text[]) returns boolean`** → same as `has_organization_role`, but true if the caller holds **any** of `role_names` there. Added for the Employee Management Foundation milestone to avoid an unreadable 6–8-way OR chain of `has_organization_role` calls in the `employees` policies below — a thin, justified extension of the same pattern, not a second role-checking mechanism.

All three are `SECURITY DEFINER` for the same reason: they are called *from within* RLS policies on `organization_memberships`/`membership_roles`, and a `SECURITY INVOKER` version's own internal query against those same tables would re-trigger the calling policy — "infinite recursion detected in policy." Running as the function owner (which has `BYPASSRLS` under standard Supabase project setup) breaks that cycle. None of the three is granted to `PUBLIC`; all are revoked from `PUBLIC` and re-granted to `authenticated` only, and none is meant to be called as a public RPC endpoint — they're internal building blocks for policies.

Unlike the original design below, **neither function resolves a single "current active organization" from a JWT claim.** Both take an explicit `target_org_id` and check membership/role **per row**, for whichever organization that specific row belongs to. This sidesteps needing the Custom Access Token Auth Hook (§8.2) — which requires Supabase project/dashboard configuration this milestone doesn't have access to — without weakening tenant isolation: every policy below still resolves, for every row, to a real, live database check against `organization_memberships`.

Implemented policies, per table (all `to authenticated`; nothing is ever granted to `anon`; no policy uses `USING (true)` — see the migration file's own header comment for the one table, `roles`, where fully open *read* access is a deliberate, justified exception, not an oversight):

| Table | `select` | `insert` | `update` | `delete` |
|---|---|---|---|---|
| `organizations` | `is_organization_member(id)` | — (deferred) | — (deferred) | — (deferred) |
| `profiles` | `id = auth.uid()` | — (trigger-only, see §4.2) | `id = auth.uid()` | — (identity persists) |
| `organization_memberships` | `user_id = auth.uid() OR is_organization_member(organization_id)` | — (deferred) | — (deferred) | — (deferred) |
| `roles` | any authenticated user | — (seed-only) | — (seed-only) | — (seed-only) |
| `membership_roles` | own membership's rows, or any row in an org you're an active member of | company_admin (any role except `platform_super_admin`); operations_manager (any role except `company_admin`, `project_manager`, `hseq_manager`, `hse_officer`, `foreman`, `recruiter`, or `platform_super_admin` — **updated** by `supabase/migrations/20260726120000_role_catalogue_update.sql`) | — (no policy — see note below) | mirrors insert's assigner rule, **and** blocked outright if the row being deleted is this org's last active `company_admin` assignment (a correlated `count(*)` check in the policy itself, so this rule holds even against a direct API call, not just the app's own UI) |
| `audit_events` | `has_organization_role(organization_id, 'company_admin') OR has_organization_role(organization_id, 'hseq_manager')` | `actor_user_id = auth.uid() AND is_organization_member(organization_id)` | **never** (no policy + hard trigger) | **never** (no policy + hard trigger) |
| `employees` | `is_organization_member(organization_id)` AND (`has_any_organization_role` with `company_admin`/`operations_manager`/`hseq_manager`/`project_manager`/`inspector`/`planner` — **updated** by `supabase/migrations/20260726120000_role_catalogue_update.sql`, which dropped the retired `supervisor`/`payroll_admin` and deliberately did not add `hse_officer`/`foreman`/`recruiter`, since all three are meant to be project- or Talent-Pool-scoped once that infrastructure exists — OR `profile_id = auth.uid()`). **No other `SELECT` policy grants raw row access** — a project/team-mate (including `hse_officer`/`foreman`) never gets a policy-level `SELECT` on this table; see the `get_basic_employee_info()` note below for how that visibility is actually implemented, narrow-column-only. | `is_organization_member(organization_id)` AND `has_any_organization_role(organization_id, ['company_admin','operations_manager'])` | same condition as insert, **and** — **updated** by `supabase/migrations/20260727090000_employment_periods.sql` — column-scoped: `authenticated`'s `UPDATE` grant no longer covers `employment_status`/`start_date`/`end_date` at all (a column-level `REVOKE`, independent of this row-level policy); only the `SECURITY DEFINER` employment-period sync function can still write them | **never** — no policy, no grant; rows are archived (`account_status = 'archived'`), never deleted |
| `get_basic_employee_info(target_employee_ids)` — **function, not RLS** | `SECURITY DEFINER` function (`supabase/migrations/20260728090000_projects_and_teams.sql`), not a table policy — the sole channel a project/team-mate ever sees another employee's info through. Performs its OWN per-row authorization check (self, an org-wide manager role, or `is_project_teammate()` — a current shared `project_assignments`/`team_assignments` row) and returns **only** `id`/`first_name`/`last_name`/`position_title`/`profile_id`/`archived_at` — never `work_email`/`phone`/`birth_date`/`employment_status`/`account_status`/`created_by`/`updated_by`. **Review/Hardening Pass**: the first version of this migration granted a raw `employees_select_project_teammates` `SELECT` policy instead — since PostgreSQL RLS restricts *rows*, not *columns*, that policy exposed every column (including the sensitive ones just listed) to any project/team-mate, not the "basic record" its own comment claimed. That policy has been removed entirely; this function is its replacement. `modules/teams/queries.ts`/`modules/projects/queries.ts` call it instead of `.from("employees").select(...)` wherever a project/team-mate's display info is needed. | — | — | — |
| `employee_employment_periods` | mirrors `employees`' select exactly (same reader-role array, plus the caller's own linked record via a lookup on `employees.profile_id`) — **implemented**, `supabase/migrations/20260727090000_employment_periods.sql` | `company_admin`/`operations_manager`, mirroring `employees_insert_managers` | same condition as insert, **and** a hard trigger (regardless of role) permits only two shapes: correcting an open period's `start_date`, or closing it — an already-closed period is immutable | **never** — no policy, no grant; history is never removed |

"— (deferred)" cells have no `authenticated`-role policy *and* no `GRANT` for that operation — invite/settings/role-management flows aren't built yet (out of scope for this milestone; see the implementation report). A GRANT is required in addition to a policy for any of these tables to be reachable via the Data API at all — current Supabase projects don't auto-expose newly created tables (see `auto_expose_new_tables` in `supabase/config.toml`); every implemented `select`/`insert`/`update`/`delete` above has a matching `GRANT` in the migration.

`membership_roles`' `update` cell has no policy at all — a role assignment is either present or absent; there is nothing on the row to edit, only insert (assign) or delete (remove), matching the "no `updated_at`" note in its own table section above.

`organization_employee_number_counters` (added by the Employee Management Polish milestone) has RLS enabled and forced like every table here, but **zero policies of any kind and zero grants to `authenticated`** — it has no direct API surface at all; every read/write happens exclusively inside `allocate_employee_number()`, a `SECURITY DEFINER` function that runs as its owner regardless of the calling role's own grants.

RLS is **enabled and forced** (`enable row level security` + `force row level security`) on every one of these eight tables.

### 8.2 Original design (future enhancement, not yet built)

The rest of this section is preserved as-written from the original proposal — a single "active organization" resolved from a JWT claim, refreshed via a Custom Access Token Auth Hook. It remains a reasonable direction if/when that hook is configured (it would mostly add ergonomics — not passing an org id around — on top of what §8.1 already enforces), but nothing below is implemented:

RLS helper functions, all `SECURITY DEFINER` and `STABLE`, owned by a role that can read the underlying tables without recursive policy evaluation:

- **`current_org_id()`** → reads the `org_id` claim from `auth.jwt()` (set by the Custom Access Token Auth Hook — see [ARCHITECTURE.md §3.2](./ARCHITECTURE.md#32-organization-membership-model)) and **re-validates it live**: returns the org id only if `organization_memberships` has an `active` row for `(auth.uid(), org_id)`; otherwise returns `null`. This means a stale or forged claim — e.g., a token minted before a membership was suspended — can never grant access, since every tenant policy's `organization_id = current_org_id()` check fails cleanly against `null`.
- **`current_role_ids()`** → returns the caller's role names (from `roles.name`, via `membership_roles`) for the **currently active** membership (`organization_memberships` row matching `current_org_id()`). Resolved live on every call, not baked into the JWT, so a role change takes effect on the very next request without needing a token refresh — unlike `current_org_id()`, which is a coarser, user-initiated switch.
- **`is_platform_super_admin()`** → checks `platform_super_admins` for `auth.uid()`. Deliberately independent of `current_org_id()`/`organization_memberships` — see [ARCHITECTURE.md §3.1](./ARCHITECTURE.md#31-tenant-boundary).

Every **[tenant]** table gets, at minimum:
```sql
create policy tenant_isolation_select on <table>
  for select using (organization_id = current_org_id());

create policy tenant_isolation_write on <table>
  for insert with check (organization_id = current_org_id());
```
plus table-specific `update`/`delete` policies layered on top that also check `current_role_ids() && ARRAY[...]::text[]` (array overlap — "holds any of these roles") or a per-row ownership condition (e.g., "an Employee may only update their own draft timesheet") per the matrix in [ROLES_AND_PERMISSIONS.md](./ROLES_AND_PERMISSIONS.md), plus any explicit-restriction override (e.g., no policy ever grants `UPDATE`/`DELETE` on `audit_events` or `digital_signatures`, regardless of role).

Tables with non-standard policies, layered on top of or instead of the generic pattern above:
- **`profiles`**: `select` allowed for the caller's own row, or any row belonging to a person who shares an **active** membership with the caller in at least one common organization (needed so the UI can show "Assigned to: Jane Doe" for a colleague). `update` allowed only for the caller's own row.
- **`organization_memberships`**: an additional `select` policy allows a user to read their **own** membership rows across **all** organizations and statuses (not just the active one) — required for the organization switcher, per [ARCHITECTURE.md §3.2](./ARCHITECTURE.md#32-organization-membership-model) — layered on top of the standard tenant-scoped policy that lets org admins (`current_role_ids()` containing `company_admin` or `operations_manager`) see other members' rows within the active org. `insert`/`update` (inviting, changing status/roles) allowed for Company Admin within the active org, **or** for `is_platform_super_admin()` — the latter specifically so a Platform Super Admin can provision an organization's first Company Admin without needing a membership of their own.
- **`membership_roles`**: mirrors `organization_memberships`.
- **`organizations`**: `select` allowed for anyone with any `organization_memberships` row (any status) referencing the org, or `is_platform_super_admin()`. `insert`, and `update` of `status`/`deleted_at`, restricted to `is_platform_super_admin()`. `update` of other columns (name, settings) additionally allowed for Company Admin of that org.
- **`platform_super_admins`**: readable/writable only via `is_platform_super_admin()` (or not exposed through the API at all — managed via migration/service role, which is arguably simpler given how rarely it changes).
- **`event_categories`**: `select` allowed for system rows (`organization_id is null`) to anyone authenticated, or for custom rows matching `current_org_id()`. `insert`/`update` of custom rows restricted to `current_role_ids()` containing `company_admin` or `hseq_manager`, and only with `organization_id = current_org_id()`; no policy ever grants write access to system rows.

RLS is **always enabled** (`enable row level security` + `force row level security`) on every tenant table, including for the `postgres`/table-owner role, so a misconfigured server-side client still can't accidentally bypass it — only the explicit service-role key (used sparingly, per [ARCHITECTURE.md §7](./ARCHITECTURE.md#7-secrets-and-environment-variables)) can.

## 9. Indexing Summary

Beyond the per-table indexes noted above, every **[tenant]** table gets a leading index on `organization_id` (or `(organization_id, <most common filter>)` where noted) since it is the predicate on nearly every query via RLS. Foreign key columns are indexed by default per standard Postgres practice for join performance (`employee_id`, `project_id`, `location_id`, `membership_id`, etc., on the tables above).

## 10. Generated TypeScript Types

Once the schema is migrated, types are generated (not hand-written) via:

```bash
supabase gen types typescript --project-id <id> --schema public > types/database.ts
```

This file is regenerated whenever a migration changes the schema and is treated as build output — see [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for when this is wired into the workflow.
