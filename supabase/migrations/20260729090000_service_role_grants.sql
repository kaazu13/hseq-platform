-- Grants `service_role` the specific object privileges it needs to act as
-- the "trusted server-only" client documented in docs/ARCHITECTURE.md §7
-- (lib/supabase/admin.ts) and used for the first time by
-- scripts/seed-test-org.ts / scripts/cleanup-test-org.ts.
--
-- ── Root cause ────────────────────────────────────────────────────────
-- Every table in this schema is owned by role `postgres` (confirmed via
-- `pg_tables.tableowner` — all 13 public tables). This project has an
-- existing `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public`
-- rule (confirmed via `pg_default_acl`) that, for newly created tables,
-- grants `anon`, `authenticated`, and `service_role` only
-- TRUNCATE/REFERENCES/TRIGGER — deliberately NOT SELECT/INSERT/UPDATE/
-- DELETE. Every domain migration in this repo then explicitly layers on
-- exactly the DML privileges `authenticated` needs, table by table (e.g.
-- `grant select, insert, update on public.projects to authenticated` in
-- 20260728090000_projects_and_teams.sql). No migration has ever needed to
-- do the equivalent for `service_role`, because nothing used it — see
-- docs/ARCHITECTURE.md §7: "Not required until such an operation exists."
-- That operation exists now. This is that same explicit-grant convention,
-- applied to `service_role`, not a new pattern and not a workaround.
--
-- This migration deliberately does NOT add an `ALTER DEFAULT PRIVILEGES`
-- rule for future tables — reviewed and intentionally dropped: it would
-- give `service_role` automatic CRUD on every table any future migration
-- creates, including ones with nothing to do with this seed/admin
-- tooling, which is broader than "the tables required by the scripts"
-- calls for. Each future table gets its own explicit, reviewed grant when
-- something actually needs `service_role` to touch it — the same
-- per-table discipline every migration already applies to `authenticated`.
--
-- This is a pure object-privilege change. It does not create, drop, or
-- alter any RLS policy — `service_role` already bypasses RLS entirely by
-- role attribute (BYPASSRLS), independent of GRANT/REVOKE, so nothing here
-- interacts with the RLS model at all. It does not touch `anon` or
-- `authenticated`, and it does not touch `auth`, `storage`, `vault`, or any
-- extension schema — GoTrue's Admin API (used by the seed/cleanup scripts
-- to create/list/delete auth users) authenticates over HTTP with the
-- service-role key as a bearer token and enforces its own authorization
-- there; it never goes through these Postgres grants.
--
-- ── Scope ─────────────────────────────────────────────────────────────
-- Schema usage: already granted (`has_schema_privilege('service_role',
-- 'public', 'usage')` = true) — restated below anyway so this migration is
-- self-contained and reviewable without needing to re-run that check.
--
-- Sequences: none exist in schema public (`information_schema.sequences`
-- returns zero rows) — every primary key here defaults to
-- `gen_random_uuid()`, and the one manually-managed counter
-- (organization_employee_number_counters.next_number) is a plain integer
-- column updated only from inside allocate_employee_number(), which is
-- SECURITY DEFINER and runs as its owner regardless of caller. No sequence
-- grants are needed.
--
-- Tables: granted per-table, only the verbs scripts/seed-test-org.ts and
-- scripts/cleanup-test-org.ts actually issue (see the comment above each
-- block below for the exact call site).
--
-- DELETE: granted ONLY on `organizations`, the one table
-- scripts/cleanup-test-org.ts issues a direct `DELETE` against. Every
-- other org-scoped table (projects, teams, project_assignments,
-- team_assignments, employees, employee_employment_periods,
-- organization_memberships, membership_roles,
-- organization_employee_number_counters) is only ever reached by that
-- single DELETE through an `on delete cascade` FK — and cascade deletes do
-- NOT require DELETE privilege on the referencing (child) table. This was
-- verified empirically, not assumed: a throwaway `zz_privtest` schema was
-- created with `parent`/`child` tables (`child.parent_id references
-- parent(id) on delete cascade`), `service_role` was granted DELETE on
-- `parent` only, then `SET ROLE service_role; DELETE FROM
-- zz_privtest.parent ...` was run and both rows disappeared (confirmed via
-- row counts before/after) with no permission error — `SELECT
-- current_user` under the same `SET ROLE` confirmed the statement really
-- ran as `service_role`, not as the connecting `postgres` role. The
-- throwaway schema was dropped immediately after
-- (`information_schema.schemata` confirmed it no longer exists) and never
-- shared any object with schema `public`. PostgreSQL's FK referential
-- actions (RI_FKey_cascade_del) enforce the constraint as already
-- authorized when the FK itself was created, not as a fresh
-- privilege-checked DML statement against the current session's grants —
-- this matches that behavior.
--
-- `employees` is additionally column-restricted to `profile_id` — the
-- only column either script ever writes on that table — deliberately
-- mirroring the existing `revoke update on employees from authenticated;
-- grant update (... excluding employment_status/start_date/end_date) to
-- authenticated;` lockdown in 20260727090000_employment_periods.sql §7,
-- which exists specifically so those three columns are only ever written
-- by sync_employee_employment_snapshot() (SECURITY DEFINER). Extending the
-- same restriction to service_role costs nothing (the seed script never
-- needs those columns) and closes off an otherwise-open path to the same
-- invariant. No other table gets column-restricted: nothing else in this
-- schema has an existing per-column precedent to extend.
--
-- `organization_employee_number_counters` needs no grant at all: nothing
-- in either script reads or writes it directly, allocate_employee_number()
-- (SECURITY DEFINER) handles it as its own owner, and — per the verified
-- cascade behavior above — its row being cascade-deleted when
-- `organizations` is deleted needs no privilege of its own either.
--
-- Functions: only allocate_employee_number(uuid) needs an explicit grant.
-- Empirically checked via has_function_privilege() for every function
-- these scripts reach directly or indirectly through triggers
-- (assert_project_not_archived, assert_employee_eligible_for_assignment,
-- create_initial_employment_period, sync_employee_employment_snapshot,
-- the validate_*_insert/update/no_overlap trigger functions,
-- close_orphaned_team_assignment, handle_new_user,
-- prevent_employee_number_change): all already show
-- service_role_can_exec = true, because Postgres grants EXECUTE on a new
-- function to PUBLIC by default and none of them has ever had that revoked.
-- allocate_employee_number(uuid) is the sole exception — its own migration
-- (20260726100100_employee_numbering.sql) explicitly revokes the PUBLIC
-- default (`revoke all on function ... from public, anon, authenticated`),
-- by design, since it is meant to be reached only through
-- next_employee_number()'s role check or a migration/service-role context.

-- ── 1) schema usage (already present; restated for a self-contained migration) ──
grant usage on schema public to service_role;

-- ── 2) tables ─────────────────────────────────────────────────────────

-- organizations: ensureOrganization() selects by slug, inserts if missing.
-- cleanup-test-org.ts issues the one direct DELETE this migration grants
-- for anywhere — everything else cascades from it (see header comment for
-- why the cascade-reached tables below need no DELETE grant of their own).
grant select, insert, delete on public.organizations to service_role;

-- profiles: waitForProfile() selects the row created by handle_new_user()
-- and corrects full_name if it differs from the seed's intended value. No
-- insert (profiles are only ever created by that trigger) and no delete
-- (removed only via the auth.users cascade, not a service_role DML
-- statement on this table).
grant select, update on public.profiles to service_role;

-- organization_memberships: ensureMembership()/linkMyAccountToOrg() select,
-- insert, and (on reactivating a previously-removed membership) update
-- status.
grant select, insert, update on public.organization_memberships to service_role;

-- roles: ensureMembershipRole() looks up a role id by name. Never written.
grant select on public.roles to service_role;

-- membership_roles: ensureMembershipRole() selects then inserts.
grant select, insert on public.membership_roles to service_role;

-- employees: ensureEmployee() selects (idempotency check), inserts new
-- rows, and — only when reusing an existing row that predates a
-- profile_id link — updates profile_id. UPDATE is column-restricted to
-- profile_id; see header comment.
grant select, insert on public.employees to service_role;
grant update (profile_id) on public.employees to service_role;

-- employee_employment_periods: the employees_create_initial_period
-- trigger (SECURITY INVOKER — runs as service_role when service_role is
-- the one inserting into employees) inserts the opening period row.
-- ensureTerminated() selects the open period and updates it to close it
-- (end_date/end_reason/ended_at) for the two employees seeded as
-- terminated. Not column-restricted on UPDATE — matches the existing
-- grant shape for `authenticated` on this same table (full UPDATE;
-- protection here comes from validate_employment_period_update()'s "only
-- closing an open row" trigger check, not from column grants).
grant select, insert, update on public.employee_employment_periods to service_role;

-- projects: ensureProject() selects by (organization_id, code), inserts if missing.
grant select, insert on public.projects to service_role;

-- teams: ensureTeam() selects by (project_id, name), inserts if missing.
grant select, insert on public.teams to service_role;

-- project_assignments: ensureProjectAssignment() selects the open
-- (project_id, employee_id, assignment_role) row, inserts if missing.
-- Never updated by the script.
grant select, insert on public.project_assignments to service_role;

-- team_assignments: placeOnTeam() selects the open (project_id,
-- employee_id) row, closes it (end_at/ended_at) when moving an employee to
-- a different team, and inserts the new row — this is the "close old,
-- open new" pattern scripts/seed-test-org.ts uses for the historical team
-- move (ensureHistoricalMove()).
grant select, insert, update on public.team_assignments to service_role;

-- ── 3) sequences ──────────────────────────────────────────────────────
-- None exist in schema public — see header comment. Nothing to grant.

-- ── 4) functions ──────────────────────────────────────────────────────
-- allocate_employee_number(): the only function either script calls
-- directly (ensureEmployee() -> admin.rpc('allocate_employee_number', ...)).
-- Every other function these scripts reach (directly or via trigger) is
-- already executable by service_role through Postgres's default
-- PUBLIC-execute grant — see header comment.
grant execute on function public.allocate_employee_number(uuid) to service_role;
