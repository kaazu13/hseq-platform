# Database Schema

This document specifies the PostgreSQL schema for Supabase. Most of it is still a design proposal to guide implementation milestones in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) — exact column lists may be refined in migration review, but the entities, relationships, and tenancy rules below should not change without updating this document first.

## Implementation Status

**Six tables are implemented and migrated** (as SQL files, not yet applied to any remote project — see below): `organizations`, `profiles`, `organization_memberships`, `roles`, `membership_roles`, `audit_events`. They are the database-foundation milestone — auth, multi-org tenancy, multi-role authorization, and immutable audit evidence — with every other table in this document still proposed, not built. The migrations live in `supabase/migrations/`, in the order listed in that milestone's implementation report; `supabase/seed.sql` seeds the role catalogue and one example organization for local development.

Three deliberate deviations from the design as originally written here, applied consistently everywhere below:

1. **`roles` is a table, not an enum.** The original design used a `user_role` Postgres enum. It's now a proper reference table (`id`, `name`, `description`, `is_system`) that `membership_roles.role_id` foreign-keys into, so the catalogue can carry a description and be queried/joined normally. See [`roles`](#roles--tenant--implemented) below. Still a fixed, non-organization-configurable catalogue for v1 — the *mechanism* changed, not the product decision in [ROLES_AND_PERMISSIONS.md](./ROLES_AND_PERMISSIONS.md).
2. **`audit_logs` is named `audit_events`.** Purely a naming change; the design is otherwise unchanged. Every cross-reference in this document has been updated to match.
3. **RLS does not depend on an "active organization" JWT claim.** The original design (§8, preserved below as a documented future enhancement) resolves a single active organization from a Custom Access Token Auth Hook. That hook must be configured at the Supabase project/dashboard level — out of reach from a migration file, and still unconfigured (see the implementation report). Instead, the implemented helper functions (`is_organization_member(target_org_id)`, `has_organization_role(target_org_id, role_name)`) take an explicit organization id and check membership **per row**, for whichever organization that row belongs to. Tenant isolation is fully enforced either way; what the JWT-claim approach adds on top is convenience (not needing to pass an org id around) once that hook exists.

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
| `employment_type` | `full_time`, `part_time`, `contractor`, `temporary` |
| `employee_status` | `active`, `on_leave`, `terminated` |
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
| `audit_action` | `create`, `update`, `delete`, `restore`, `approve`, `reject`, `sign`, `close`, `amend`. **Implemented** — used by `audit_events` (renamed from `audit_logs`; see [Implementation Status](#implementation-status)). |

> **Removed from the earlier version of this document**: `user_status` (superseded by `membership_status`), `incident_type` (superseded by the configurable [`event_categories`](#event_categories--tenant--global-system-rows) table), and the `user_role` enum (superseded by the [`roles`](#roles--tenant--implemented) table — see [Implementation Status](#implementation-status)).

## 3. Core Tables

### `organizations` — **[global]**, tenant root — **Implemented**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text not null | |
| `slug` | text not null | **unique** — used in URLs/subdomains |
| `status` | `organization_status` not null default `trial` | |
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
| `id` | uuid PK, references `auth.users(id)` | Same id as the Supabase Auth user. |
| `full_name` | text not null | |
| `phone` | text null | |
| `active_organization_id` | uuid null, FK `organizations(id)` | UX preference only — which organization to default into. **Not** a security boundary; every RLS decision re-validates against `organization_memberships` regardless of this value. See [ARCHITECTURE.md §3.2](./ARCHITECTURE.md#32-organization-membership-model). |
| `created_at` / `updated_at` | timestamptz | |

No `deleted_at` — a person's identity isn't "deleted" when they leave an organization; that's expressed by their `organization_memberships.status` becoming `removed`. No `created_by`/`updated_by` — "who invited this person" is tracked on the relevant `organization_memberships.created_by` instead, which is the meaningful attribution (an identity can be created by self-signup completing an invite, not by another user acting on the `profiles` row itself).

**Indexes**: `(active_organization_id)` — added preemptively in the actual migration rather than waiting for it to show up as a hot path; cheap on a table this shape, and the switcher's default-org lookup is a near-certain future query.

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
| `name` | text not null | **unique** — the slug (`platform_super_admin`, `company_admin`, `operations_manager`, `hseq_manager`, `project_manager`, `supervisor`, `inspector`, `planner`, `payroll_admin`, `employee`), seeded by `supabase/seed.sql`. |
| `description` | text null | |
| `is_system` | boolean not null default `true` | Every v1 row is system-defined; the column exists so a future org-custom-role feature (not in scope) has somewhere to record the distinction without a schema change. |
| `created_at` | timestamptz not null default now() | |

**Deletion behavior**: none through the application — not application-writable at all (no `INSERT`/`UPDATE`/`DELETE` RLS policy for `authenticated`); the catalogue is seed data. **Indexes**: `unique(name)` (also serves as the lookup index).

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

### `employee_profiles` — **[tenant]**
HR record for a person working for the org. Distinct from `profiles` because a worker may exist on the crew before (or without ever) getting platform login access, and because `profiles` is now a global identity table not scoped to this org.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | |
| `user_id` | uuid null, FK `profiles(id)` | Null until/unless the employee is granted login access. Subject to the [cross-reference validation rule](./ARCHITECTURE.md#34-cross-reference-validation-rule) — must have an active `organization_memberships` row for this `organization_id` when set. |
| `supervisor_id` | uuid null, FK `employee_profiles(id)` | Self-referencing — this employee's direct supervisor, if one is assigned. Used to route certificate-expiry notifications (see [`document_expiry_notification_log`](#document_expiry_notification_log--tenant)) and, later, other supervisor-facing views. Must resolve to an employee in the same `organization_id` (enforced at the application layer, same rule as above; a same-table self-FK doesn't need the cross-tenant check but should still be validated as non-circular). |
| `employee_number` | text not null | **unique per org** — `unique (organization_id, employee_number)` |
| `first_name` / `last_name` | text not null | |
| `job_title` / `trade` | text null | |
| `employment_type` | `employment_type` not null | |
| `status` | `employee_status` not null default `active` | |
| `hire_date` | date null | |
| `termination_date` | date null | |
| `emergency_contact_name` / `emergency_contact_phone` | text null | |
| `created_at` / `updated_at` / `created_by` / `updated_by` | | |
| `deleted_at` | timestamptz null | Soft delete — employment history and linked timesheets/HSEQ sign-offs must be retained. |

**Indexes**: `(organization_id, status)`, `(user_id)`, `(supervisor_id)`.

### `projects` — **[tenant]**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | |
| `name` | text not null | |
| `code` | text not null | **unique per org** — `unique (organization_id, code)` |
| `client_name` | text null | |
| `address` | text null | |
| `status` | `project_status` not null default `planned` | |
| `start_date` / `end_date` | date null | |
| `project_manager_id` | uuid null, FK `profiles(id)` | Cross-reference validation rule applies (must have an active membership in this org). |
| `created_at` / `updated_at` / `created_by` / `updated_by` | | |
| `deleted_at` | timestamptz null | Closed projects are archived, not deleted — historical HSEQ/timesheet data must remain queryable. |

**Indexes**: `(organization_id, status)`.

### `project_locations` — **[tenant]** (work areas)
Self-referencing to allow an optional hierarchy (Project → Zone → Work Area) without a fixed depth.

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
| `employee_id` | uuid not null, FK `employee_profiles(id)` | |
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
| `employee_id` | uuid not null, FK `employee_profiles(id)` | |
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

**Payroll export (v1)**: timesheets are exported read-only as CSV and Excel-friendly (XLSX) files, generated on demand by a Route Handler (see [API_CONVENTIONS.md §9](./API_CONVENTIONS.md#9-file-uploads) sibling section on downloads) directly from this table plus `employee_profiles`/`projects` for display fields. No separate "export batch" or payroll-provider-integration table exists in v1 — see [PRODUCT_REQUIREMENTS.md §3](./PRODUCT_REQUIREMENTS.md#3-non-goals-initial-release).

### `hour_discrepancy_requests` — **[tenant]**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | |
| `timesheet_id` | uuid not null, FK `timesheets(id)` | |
| `employee_id` | uuid not null, FK `employee_profiles(id)` | |
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
| `employee_id` | uuid not null, FK `employee_profiles(id)` | |
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
Deduplication/history log for the certificate-expiry notification sweep (see [PRODUCT_REQUIREMENTS.md §7](./PRODUCT_REQUIREMENTS.md#7-certificate-expiry-notification-schedule)). A scheduled job (Vercel Cron → Route Handler, per [ARCHITECTURE.md §13](./ARCHITECTURE.md#13-explicitly-deferred-avoid-premature-complexity)) runs daily, and for each `employee_documents` row with a non-null `expiry_date`, checks whether today matches one of the fixed default milestones (60/30/14/7 days before, on the expiry date) and — for the one-time milestones — writes a row here and fans out `notifications` to the employee, their `supervisor_id` (if any, via that employee's linked `user_id`), everyone holding `hseq_manager` in the org, and everyone holding `company_admin` or `payroll_admin` in the org (the v1 default for "designated administration recipient" — see [PRODUCT_REQUIREMENTS.md §7](./PRODUCT_REQUIREMENTS.md#7-certificate-expiry-notification-schedule)).

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

### `lmra_assessments` — **[tenant]**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | |
| `project_id` | uuid not null, FK `projects(id)` | |
| `location_id` | uuid null, FK `project_locations(id)` | |
| `conducted_by` | uuid not null, FK `profiles(id)` | |
| `conducted_at` | timestamptz not null | |
| `task_description` | text not null | |
| `risk_level` | `risk_level` not null | |
| `result` | `lmra_result` not null | |
| `notes` | text null | |
| `created_at` / `updated_at` / `created_by` / `updated_by` | | |
| `deleted_at` | timestamptz null | HSEQ evidence — never hard-deleted. |

### `lmra_participants` — **[tenant]** (join table)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid not null, FK | Denormalized for RLS simplicity/performance (avoids a join through `lmra_assessments` in every policy). |
| `lmra_assessment_id` | uuid not null, FK `lmra_assessments(id)` | |
| `employee_id` | uuid not null, FK `employee_profiles(id)` | |
| `signature_id` | uuid null, FK `digital_signatures(id)` | |

**Constraints**: `unique (lmra_assessment_id, employee_id)`.

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
| `employee_id` | uuid null, FK `employee_profiles(id)` | Null if the person is not an employee (e.g., visitor). |
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
| `membership_roles` | Hard delete | A role grant is present or absent; removing one is deleting the row, audit-logged by the caller. |
| `employee_profiles` | Soft delete | Employment history, linked timesheets/HSEQ records. |
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

Two RLS helper functions exist, both `SECURITY DEFINER`, `STABLE`, and with `search_path` pinned to `public, pg_temp` (blocks search_path-hijacking against a definer-privileged function — the classic escalation vector for this pattern):

- **`is_organization_member(target_org_id uuid) returns boolean`** → true if the caller has an **active** `organization_memberships` row for `target_org_id`.
- **`has_organization_role(target_org_id uuid, role_name text) returns boolean`** → true if the caller has an active membership in `target_org_id` **and** holds `role_name` there (via `membership_roles` → `roles`).

Both are `SECURITY DEFINER` for the same reason: they are called *from within* RLS policies on `organization_memberships`/`membership_roles`, and a `SECURITY INVOKER` version's own internal query against those same tables would re-trigger the calling policy — "infinite recursion detected in policy." Running as the function owner (which has `BYPASSRLS` under standard Supabase project setup) breaks that cycle. Neither function is granted to `PUBLIC`; both are revoked from `PUBLIC` and re-granted to `authenticated` only, and neither is meant to be called as a public RPC endpoint — they're internal building blocks for policies.

Unlike the original design below, **neither function resolves a single "current active organization" from a JWT claim.** Both take an explicit `target_org_id` and check membership/role **per row**, for whichever organization that specific row belongs to. This sidesteps needing the Custom Access Token Auth Hook (§8.2) — which requires Supabase project/dashboard configuration this milestone doesn't have access to — without weakening tenant isolation: every policy below still resolves, for every row, to a real, live database check against `organization_memberships`.

Implemented policies, per table (all `to authenticated`; nothing is ever granted to `anon`; no policy uses `USING (true)` — see the migration file's own header comment for the one table, `roles`, where fully open *read* access is a deliberate, justified exception, not an oversight):

| Table | `select` | `insert` | `update` | `delete` |
|---|---|---|---|---|
| `organizations` | `is_organization_member(id)` | — (deferred) | — (deferred) | — (deferred) |
| `profiles` | `id = auth.uid()` | — (trigger-only, see §4.2) | `id = auth.uid()` | — (identity persists) |
| `organization_memberships` | `user_id = auth.uid() OR is_organization_member(organization_id)` | — (deferred) | — (deferred) | — (deferred) |
| `roles` | any authenticated user | — (seed-only) | — (seed-only) | — (seed-only) |
| `membership_roles` | own membership's rows, or any row in an org you're an active member of | — (deferred) | — (deferred) | — (deferred) |
| `audit_events` | `has_organization_role(organization_id, 'company_admin') OR has_organization_role(organization_id, 'hseq_manager')` | `actor_user_id = auth.uid() AND is_organization_member(organization_id)` | **never** (no policy + hard trigger) | **never** (no policy + hard trigger) |

"— (deferred)" cells have no `authenticated`-role policy *and* no `GRANT` for that operation — invite/settings/role-management flows aren't built yet (out of scope for this milestone; see the implementation report). A GRANT is required in addition to a policy for any of these tables to be reachable via the Data API at all — current Supabase projects don't auto-expose newly created tables (see `auto_expose_new_tables` in `supabase/config.toml`); every implemented `select`/`insert` above has a matching `GRANT` in the migration.

RLS is **enabled and forced** (`enable row level security` + `force row level security`) on every one of these six tables.

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
