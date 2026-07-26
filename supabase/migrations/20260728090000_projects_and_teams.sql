-- Projects & Team Management milestone.
--
-- Four new tables, layered the same way `employees`/`employee_employment_periods`
-- are: a durable entity (`projects`, `teams`) plus an append-only-in-spirit
-- assignment table recording who currently (or previously) held a role
-- against it (`project_assignments`, `team_assignments`). See each table's
-- own comment below for specifics.
--
-- OVERALL SHAPE:
--   organizations 1──* projects 1──* teams
--   projects *──* employees   (via project_assignments — the project's roster
--                               AND its PM/HSEQ Manager/HSE Officer/Inspector)
--   teams    *──* employees   (via team_assignments — member/foreman)
--
-- Within one project, an employee may hold at most one OPEN team_assignments
-- row at a time (enforced by a partial unique index), but may hold several
-- simultaneous project_assignments rows (e.g. both `project_manager` and
-- `member`) and may be assigned to more than one project at once — see the
-- constraints on each table below for exactly how.
--
-- VISIBILITY (docs/ROLES_AND_PERMISSIONS.md §2's "assignment-driven
-- visibility" principle, applied here for the first time): holding a
-- project-scoped organization role (project_manager/hseq_manager/
-- hse_officer/inspector) grants NO visibility into any project by itself —
-- only an explicit `project_assignments` row does. Foreman is the one
-- exception by design: a Foreman's project visibility comes from an active
-- `team_assignments` row (assignment_role = 'foreman') in that project, not
-- a separate project_assignments row — see docs/ROLES_AND_PERMISSIONS.md's
-- Foreman row ("team assignment, not the role itself, determines which
-- teams"). Plain employees (and any other project-scoped role) likewise see
-- a project only once they hold a current assignment in it, project- or
-- team-level — never implicitly.
--
-- REVIEW/HARDENING PASS (this migration is still unapplied, so it is
-- corrected in place rather than patched with a follow-up file — same rule
-- already used by every prior milestone's correction pass):
--   1. `employees_select_project_teammates` (the original version of this
--      migration) granted RAW, FULL-ROW `employees` access to any
--      project/team-mate — RLS restricts rows, not columns, so this
--      exposed work_email/phone/birth_date/employment_status/
--      account_status/created_by/updated_by to every teammate, not just
--      "basic" fields as the original comment claimed. Replaced with
--      `get_basic_employee_info()`, a SECURITY DEFINER function that
--      returns only an approved, narrow column set and performs its own
--      authorization check per row — the RAW policy is removed entirely.
--   2. Composite foreign keys added throughout (`(id, organization_id)`
--      and `(id, project_id, organization_id)` uniqueness plus matching
--      composite FKs) so a child row's `organization_id`/`project_id`
--      mismatching its parent is a constraint violation, not just an
--      application bug — never relying on app code alone.
--   3. `team_assignments`/`project_assignments` switched from `date`
--      start/end columns to `timestamptz` (`start_at`/`end_at`) — a
--      same-day team move (close old, open new) is now unambiguous at
--      timestamp precision, and an overlap-prevention trigger (new) can
--      use a simple `>=` comparison with no date-granularity ambiguity.
--      "Current" is, and remains, `end_at is null` — see each table's
--      comment.
--   4. New INSERT-time eligibility triggers reject assigning an employee
--      who isn't currently employed (`employment_status <> 'active'` or
--      `archived_at is not null`), assigning into an archived project, or
--      assigning into an archived team.
--   5. New overlap-prevention triggers reject a new/reopened assignment
--      period that starts before the same employee's own prior period (in
--      the same project, and — for project_assignments — the same role)
--      ended, closing the gap the original version left between "at most
--      one OPEN row" and "periods never overlap."
--   6. Archiving a team with open assignments is rejected outright (not
--      silently cascaded) — a deliberate choice; see the `teams` UPDATE
--      guard trigger's comment.
--   7. Closing an employee's LAST open `project_assignments` row for a
--      project now automatically closes their open `team_assignments` row
--      in that same project too — an employee can no longer remain
--      "orphaned" (actively on a team with zero project roster standing).
--   8. `save_team_with_assignments()` (new) wraps team-field create/update
--      and every assignment change from the Team dialog in one function
--      call — one transaction — so a partial failure (team saved but an
--      assignment change rejected) is no longer possible. `reorder_teams()`
--      (new) does the same for manual reordering.

-- ── 1) enums ──────────────────────────────────────────────────────────
create type public.project_status as enum ('planning', 'active', 'completed', 'archived');

comment on type public.project_status is
  '"Archived" is this table''s retirement mechanism — there is no separate archived_at column and no hard delete, matching the platform''s "never permanently delete" convention via a status value instead (a deliberate difference from employees, which uses a dedicated archived_at independent of a status enum — projects have no equivalent to employees'' independent account-lifecycle concept, so one field is enough here). "Completed" is NOT a lock state — a completed project remains fully editable, same as planning/active; only "archived" blocks new teams/assignments (see the eligibility triggers below). This is a deliberate scope decision, not an oversight: nothing in this milestone''s requirements asked for a read-only "completed" state, and inventing one would restrict legitimate retroactive corrections to a just-finished project.';

create type public.project_assignment_role as enum ('project_manager', 'hseq_manager', 'hse_officer', 'inspector', 'member');

comment on type public.project_assignment_role is
  'Who an employee is with respect to a project, at the project level (not team level). `member` = plain roster inclusion (no elevated project permission, just "currently works on this project" — the pool team_assignments draws from). The other four grant project-scoped RLS visibility matching the equivalent organization role, and require the assignee to already hold that same organization role (see validate_project_assignment_insert() below). Deliberately excludes `foreman`: a Foreman''s project visibility comes from team_assignments instead — see this migration''s header comment.';

create type public.team_color as enum ('gray', 'blue', 'green', 'yellow', 'orange', 'red', 'purple', 'cyan', 'brown');

comment on type public.team_color is
  'A fixed, Google-Calendar-style palette — the UI stores this key, never a hex value, so the rendered color can change centrally (a design-system update) without a data migration. Enforced at the database level (this enum rejects any value outside the fixed nine, even bypassing the client) and mirrored in modules/teams/types.ts for the key-to-Tailwind-class mapping.';

create type public.team_status as enum ('active', 'archived');

create type public.team_assignment_role as enum ('member', 'foreman');

-- ── 2) composite-FK enablement on the existing `employees` table ────────
-- `employees` was created by an earlier, already-applied migration
-- (20260725091000_employees.sql) and is never edited directly — this adds
-- a new constraint via ALTER TABLE instead, the same pattern already used
-- by the Role Catalogue & Permissions and Employment Lifecycle milestones
-- to extend already-applied tables. A plain uniqueness constraint on
-- (id, organization_id) — redundant with `id` alone already being unique,
-- but required so project_assignments/team_assignments can composite-FK
-- against it and get "the referenced employee actually belongs to this
-- organization" enforced by the database itself, not application code.
alter table public.employees
  add constraint employees_id_organization_id_key unique (id, organization_id);

-- ── 3) projects ───────────────────────────────────────────────────────
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  client_name text,
  code text,
  description text,
  status public.project_status not null default 'planning',
  start_date date,
  end_date date,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  constraint projects_name_not_blank check (btrim(name) <> ''),
  constraint projects_end_after_start check (end_date is null or start_date is null or end_date >= start_date),
  -- Enables composite FKs from teams/project_assignments — see §2's comment.
  constraint projects_id_organization_id_key unique (id, organization_id)
);

comment on table public.projects is
  'A contracted job/site the organization is executing. Never hard-deleted — retiring one is a status change (''archived''), not a DELETE (no DELETE RLS policy or grant exists on this table at all). Archiving blocks new teams/project_assignments/team_assignments (see each table''s eligibility trigger) but does not touch existing ones — history remains fully readable to anyone already authorized to see it.';

-- code is optional (unlike employees.employee_number, which is mandatory
-- and system-generated) — a partial unique index, same shape as
-- employees_org_employee_number_key, so any number of projects may have no
-- code, but two projects in the same org may never share one.
create unique index projects_org_code_key
  on public.projects (organization_id, code)
  where code is not null;

create index projects_organization_id_idx on public.projects (organization_id, status);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ── 4) shared helper: reject writes against an archived project ─────────
-- Used by teams/project_assignments/team_assignments' own INSERT triggers
-- below — one definition rather than three copies of the same lookup.
create or replace function public.assert_project_not_archived(target_project_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status public.project_status;
begin
  select status into v_status from public.projects where id = target_project_id;

  if v_status is null then
    raise exception 'project % not found', target_project_id;
  end if;

  if v_status = 'archived' then
    raise exception 'project % is archived and cannot receive new teams or assignments', target_project_id;
  end if;
end;
$$;

-- ── 5) shared helper: reject assigning an ineligible employee ───────────
-- An employee must be currently employed (employment_status = 'active',
-- itself a derived snapshot of employee_employment_periods — see
-- supabase/migrations/20260727090000_employment_periods.sql) and not
-- archived to be newly assigned to a project or team. Organization match
-- is enforced separately, by the composite FKs added on each table below
-- — this function only checks the two facts a FK/CHECK constraint cannot
-- express (they require reading another table's current values, not just
-- shape). Not applied to CLOSING a row (only to opening one) — an employee
-- who becomes ineligible after being assigned is not retroactively
-- unassigned by this check; see this migration's header point 7 for the
-- one case that IS handled automatically (losing the last project
-- assignment).
create or replace function public.assert_employee_eligible_for_assignment(target_employee_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_employment_status public.employment_status;
  v_archived_at timestamptz;
begin
  select employment_status, archived_at into v_employment_status, v_archived_at
  from public.employees
  where id = target_employee_id;

  if v_employment_status is null then
    raise exception 'employee % not found', target_employee_id;
  end if;

  if v_archived_at is not null then
    raise exception 'employee % is archived and cannot be assigned', target_employee_id;
  end if;

  if v_employment_status <> 'active' then
    raise exception 'employee % is not currently employed (employment_status = %) and cannot be assigned', target_employee_id, v_employment_status;
  end if;
end;
$$;

-- ── 6) project_assignments ───────────────────────────────────────────
create table public.project_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null,
  employee_id uuid not null,
  assignment_role public.project_assignment_role not null,
  -- timestamptz, not date — see this migration's header point 3. `end_at`
  -- null means this row is currently open/active; the same signal used
  -- everywhere in this schema ("current" = *_at is null), never
  -- `*_at >= current_date` or any other comparison — see
  -- has_project_access()/is_project_manager() below and
  -- docs/DATABASE_SCHEMA.md's Projects section for the single definition
  -- every query in this milestone uses.
  start_at timestamptz not null default now(),
  end_at timestamptz,
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  ended_by uuid references public.profiles (id) on delete set null,
  ended_at timestamptz,
  notes text,
  constraint project_assignments_end_after_start check (end_at is null or end_at >= start_at),
  -- Composite FKs — the database-level org-boundary guarantee from this
  -- migration's header point 2: a project_assignments row can never
  -- reference a project or employee belonging to a DIFFERENT organization
  -- than the one this row itself claims.
  constraint project_assignments_project_fk foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  constraint project_assignments_employee_fk foreign key (employee_id, organization_id) references public.employees (id, organization_id) on delete cascade
);

comment on table public.project_assignments is
  'Who currently (or previously) held a project-level capacity — the project''s employee roster (assignment_role = ''member'') and its Project Manager(s)/HSEQ Manager(s)/HSE Officer(s)/Inspector(s). This is what "an employee is assigned to a project" means throughout this schema; it is deliberately separate from team_assignments (which is about a specific team WITHIN a project an employee has already been rostered onto here) — see this migration''s header comment. History is preserved (end_at/ended_by/ended_at close a row; nothing is ever deleted), but unlike team_assignments an employee may hold several simultaneously-open rows here (e.g. ''member'' and ''project_manager'' at once) — only a duplicate of the exact same (project, employee, role) is prevented.';

-- Prevents the exact same (project, employee, role) being open twice — not
-- "one active assignment per project" (unlike team_assignments below): an
-- employee may simultaneously be this project's ''member'' AND its
-- ''project_manager'', for example.
create unique index project_assignments_one_open_role_per_employee
  on public.project_assignments (project_id, employee_id, assignment_role)
  where end_at is null;

create index project_assignments_project_id_idx on public.project_assignments (project_id) where end_at is null;
create index project_assignments_employee_id_idx on public.project_assignments (employee_id) where end_at is null;
create index project_assignments_organization_id_idx on public.project_assignments (organization_id);

-- Same near-immutability shape as employee_employment_periods, simplified:
-- only one legal UPDATE exists at all — closing an open row (end_at/
-- ended_by/ended_at/notes). No "correct the start date" allowance is
-- offered here (nothing in this milestone's UI needs it); a closed row can
-- never be reopened or otherwise edited, for every role.
create or replace function public.validate_project_assignment_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.project_id is distinct from old.project_id
    or new.employee_id is distinct from old.employee_id
    or new.organization_id is distinct from old.organization_id
    or new.assignment_role is distinct from old.assignment_role
    or new.start_at is distinct from old.start_at
    or new.created_at is distinct from old.created_at
    or new.assigned_by is distinct from old.assigned_by then
    raise exception 'only closing an open project assignment (end_at/ended_by/ended_at/notes) is allowed';
  end if;

  if old.end_at is not null then
    raise exception 'a closed project assignment cannot be modified';
  end if;

  return new;
end;
$$;

create trigger project_assignments_validate_update
  before update on public.project_assignments
  for each row execute function public.validate_project_assignment_update();

-- All INSERT-time validation in one trigger (one pass over `new`, three
-- checks): (a) the target project must not be archived, (b) the target
-- employee must be currently employed and not archived, (c) a
-- manager-tier assignment_role requires the assignee already hold that
-- SAME organization role via their linked profile — a project assignment
-- can grant no more authority than the assignee's organization role
-- already allows org-wide. `member` is exempt from check (c) (any eligible
-- employee may be rostered). has_organization_role(org_id, role_name)
-- checks auth.uid() — the CALLING user — not an arbitrary target profile,
-- so it can't be reused for (c) directly; this checks the ASSIGNEE's own
-- membership/role rows instead.
create or replace function public.validate_project_assignment_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_holds_role boolean;
begin
  perform public.assert_project_not_archived(new.project_id);
  perform public.assert_employee_eligible_for_assignment(new.employee_id);

  if new.assignment_role = 'member' then
    return new;
  end if;

  select exists (
    select 1
    from public.employees e
    join public.organization_memberships m
      on m.user_id = e.profile_id and m.organization_id = e.organization_id and m.status = 'active'
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r on r.id = mr.role_id
    where e.id = new.employee_id
      and r.name = new.assignment_role::text
  ) into v_holds_role;

  if not coalesce(v_holds_role, false) then
    raise exception 'employee % does not hold the % organization role required for this project assignment', new.employee_id, new.assignment_role;
  end if;

  return new;
end;
$$;

create trigger project_assignments_validate_insert
  before insert on public.project_assignments
  for each row execute function public.validate_project_assignment_insert();

-- Overlap prevention: a new (or, in principle, corrected) row's start_at
-- must fall at or after every OTHER prior row's end_at for the same
-- (project, employee, role) — closing the gap between "at most one row
-- open at a time" (the partial unique index above) and "periods never
-- overlap," which that index alone does not guarantee against a
-- backdated/re-opened row starting before a prior CLOSED period ended.
-- INSERT-only: start_at can never change via UPDATE (the guard trigger
-- above forbids it unconditionally), so there is no UPDATE scenario that
-- could newly introduce an overlap.
create or replace function public.validate_project_assignment_no_overlap()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_latest_end timestamptz;
begin
  select max(end_at) into v_latest_end
  from public.project_assignments
  where project_id = new.project_id
    and employee_id = new.employee_id
    and assignment_role = new.assignment_role
    and id is distinct from new.id;

  if v_latest_end is not null and new.start_at < v_latest_end then
    raise exception 'a new project assignment must start at or after the employee''s prior assignment of the same role ended (%)', v_latest_end;
  end if;

  return new;
end;
$$;

create trigger project_assignments_validate_no_overlap
  before insert on public.project_assignments
  for each row execute function public.validate_project_assignment_no_overlap();

-- ── 7) teams ──────────────────────────────────────────────────────────
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null,
  name text not null,
  code text,
  color public.team_color not null default 'blue',
  description text,
  status public.team_status not null default 'active',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  constraint teams_name_not_blank check (btrim(name) <> ''),
  constraint teams_project_fk foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  -- Enables the composite FK from team_assignments below — guarantees a
  -- team_assignments row's project_id always matches its OWN team's
  -- project_id (not merely "some project in the same org").
  constraint teams_id_project_id_organization_id_key unique (id, project_id, organization_id)
);

comment on table public.teams is
  'A crew within a project. Never hard-deleted — ''archived'' status is the retirement path, same reasoning as projects.status. `display_order` is a plain integer manually set by a Project Manager (see reorder_teams() below) — never derived from name/created_at, and never alphabetically sorted in the UI. Deliberately just an integer column, not a linked-list or fractional-index scheme, so a future drag-and-drop reorder UI can slot in by writing new integers through the same column with no schema change.';

create index teams_project_id_idx on public.teams (project_id, display_order);
create index teams_organization_id_idx on public.teams (organization_id);

create trigger teams_set_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();

-- New teams cannot be created inside an archived project.
create or replace function public.validate_team_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.assert_project_not_archived(new.project_id);
  return new;
end;
$$;

create trigger teams_validate_insert
  before insert on public.teams
  for each row execute function public.validate_team_insert();

-- Archiving a team with open (end_at is null) team_assignments is
-- rejected outright rather than silently cascading a mass-close — a
-- deliberate choice: the Project Manager must explicitly move or remove
-- every current member first (each of which is itself an explicit,
-- audited action), so an archive action can never be the hidden cause of
-- N employees suddenly losing their team. This is the opposite behavior
-- from project_assignments' "closing the last one auto-closes the team
-- assignment" (this migration's header point 7) — that case is narrowing
-- FROM a still-active project to zero standing (a genuine "you shouldn't
-- be here anymore"), not an archival action a manager might reconsider.
create or replace function public.validate_team_status_change()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.status = 'archived' and old.status <> 'archived' then
    if exists (select 1 from public.team_assignments where team_id = new.id and end_at is null) then
      raise exception 'team % still has active members — move or remove them before archiving', new.id;
    end if;
  end if;

  return new;
end;
$$;

create trigger teams_validate_status_change
  before update on public.teams
  for each row execute function public.validate_team_status_change();

-- ── 8) team_assignments ──────────────────────────────────────────────
create table public.team_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Denormalized from team_id (same pattern as membership_roles.organization_id
  -- and employee_employment_periods.organization_id) — this is what makes
  -- "one active team per PROJECT" (not merely per team) a single-column
  -- partial unique index below, and what keeps the visibility RLS on
  -- projects/employees from needing an extra join through teams.
  project_id uuid not null,
  team_id uuid not null,
  employee_id uuid not null,
  assignment_role public.team_assignment_role not null default 'member',
  -- timestamptz, not date — see this migration's header point 3.
  start_at timestamptz not null default now(),
  end_at timestamptz,
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  ended_by uuid references public.profiles (id) on delete set null,
  ended_at timestamptz,
  notes text,
  constraint team_assignments_end_after_start check (end_at is null or end_at >= start_at),
  -- Composite FK to teams(id, project_id, organization_id): guarantees, in
  -- one constraint, that team_id is a real team AND that this row's
  -- project_id/organization_id EXACTLY match that team's own — a
  -- team_assignments row can never claim a project_id other than the
  -- team's actual project.
  constraint team_assignments_team_fk foreign key (team_id, project_id, organization_id) references public.teams (id, project_id, organization_id) on delete cascade,
  constraint team_assignments_employee_fk foreign key (employee_id, organization_id) references public.employees (id, organization_id) on delete cascade
);

comment on table public.team_assignments is
  'Which team, if any, an employee currently belongs to within a project. At most one OPEN row per (project, employee) — not per (team, employee) — enforced by the partial unique index below, which is the literal database expression of "within one project, an employee may only belong to one active team at a time." "Current" = end_at is null, consistently, everywhere this table is queried (modules/teams/queries.ts, has_project_access(), is_project_manager()) — never a date/timestamp range comparison. Moving an employee between teams is ALWAYS close-existing-row-then-insert-new-row, performed atomically by move_employee_to_team() below, using ONE shared "now" timestamp for both halves so the closing row''s end_at and the opening row''s start_at are identical — an immediate same-day (same-instant) move produces no ambiguity about which row is "current" (end_at is null resolves it unconditionally) and no false overlap (the no-overlap trigger below uses >=, which treats an equal boundary as adjacent, not overlapping). Never an UPDATE that repoints team_id (blocked outright by the guard trigger, same reasoning as employee_employment_periods). History is preserved and intentionally NOT surfaced by the normal Team Cards UI, which only ever reads rows where end_at is null — see modules/teams/queries.ts.';

-- THE core invariant this milestone's assignment rules describe: one active
-- team per PROJECT (not per team), scoped by employee.
create unique index team_assignments_one_open_per_project_employee
  on public.team_assignments (project_id, employee_id)
  where end_at is null;

create index team_assignments_team_id_idx on public.team_assignments (team_id) where end_at is null;
create index team_assignments_employee_id_idx on public.team_assignments (employee_id);
create index team_assignments_organization_id_idx on public.team_assignments (organization_id);
create index team_assignments_project_employee_idx on public.team_assignments (project_id, employee_id);

-- Same near-immutability shape as project_assignments above: the only
-- legal UPDATE is closing an open row. Repointing team_id/employee_id, or
-- editing an already-closed row, is rejected unconditionally — moving an
-- employee is always "close this row, insert a new one" (see
-- move_employee_to_team() below), never an in-place edit.
create or replace function public.validate_team_assignment_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.project_id is distinct from old.project_id
    or new.team_id is distinct from old.team_id
    or new.employee_id is distinct from old.employee_id
    or new.organization_id is distinct from old.organization_id
    or new.assignment_role is distinct from old.assignment_role
    or new.start_at is distinct from old.start_at
    or new.created_at is distinct from old.created_at
    or new.assigned_by is distinct from old.assigned_by then
    raise exception 'only closing an open team assignment (end_at/ended_by/ended_at/notes) is allowed';
  end if;

  if old.end_at is not null then
    raise exception 'a closed team assignment cannot be modified';
  end if;

  return new;
end;
$$;

create trigger team_assignments_validate_update
  before update on public.team_assignments
  for each row execute function public.validate_team_assignment_update();

-- All INSERT-time validation in one trigger: the target project must not
-- be archived, the target team must be 'active' (not archived), and the
-- target employee must be currently employed and not archived.
create or replace function public.validate_team_assignment_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_team_status public.team_status;
begin
  perform public.assert_project_not_archived(new.project_id);
  perform public.assert_employee_eligible_for_assignment(new.employee_id);

  select status into v_team_status from public.teams where id = new.team_id;
  if v_team_status is null then
    raise exception 'team % not found', new.team_id;
  end if;
  if v_team_status <> 'active' then
    raise exception 'team % is archived and cannot receive new assignments', new.team_id;
  end if;

  return new;
end;
$$;

create trigger team_assignments_validate_insert
  before insert on public.team_assignments
  for each row execute function public.validate_team_assignment_insert();

-- Overlap prevention — same reasoning as project_assignments' version
-- above, scoped to (project, employee) rather than (project, employee,
-- role), matching this table's own "one active team per project" scope.
-- INSERT-only, for the same reason: start_at is immutable via UPDATE.
create or replace function public.validate_team_assignment_no_overlap()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_latest_end timestamptz;
begin
  select max(end_at) into v_latest_end
  from public.team_assignments
  where project_id = new.project_id
    and employee_id = new.employee_id
    and id is distinct from new.id;

  if v_latest_end is not null and new.start_at < v_latest_end then
    raise exception 'a new team assignment must start at or after the employee''s prior team assignment in this project ended (%)', v_latest_end;
  end if;

  return new;
end;
$$;

create trigger team_assignments_validate_no_overlap
  before insert on public.team_assignments
  for each row execute function public.validate_team_assignment_no_overlap();

-- ── 9) move_employee_to_team ─────────────────────────────────────────
-- The one and only way an application code path changes who is on which
-- team — atomically closes the employee's current open assignment in this
-- PROJECT (if any, in any team) and opens a new one in target_team_id, in a
-- single transaction (a single SQL function call is one transaction by
-- construction — see docs/DATABASE_SCHEMA.md's Teams section). Also the
-- entry point for a brand-new assignment (nothing to close). Reads
-- auth.uid() directly for assigned_by/ended_by rather than accepting an
-- actor id as a parameter — matching every other assignment/audit writer
-- in this schema — so a caller can never attribute the action to someone
-- else.
--
-- Both halves of the move (the close and the open) share ONE `v_now`
-- timestamp, computed once — this is what makes a same-instant move
-- unambiguous: the closing row's end_at and the opening row's start_at
-- are bit-for-bit identical, which the no-overlap trigger's `>=`
-- comparison treats as adjacent (legal), never overlapping.
--
-- Concurrency: `select ... for update` locks the employee's existing open
-- row (if any) for the duration of the transaction, serializing concurrent
-- moves of the SAME employee — a second concurrent call blocks until the
-- first commits, then re-reads the now-current state rather than acting on
-- stale data. For the first-ever assignment (no existing row to lock),
-- two concurrent calls can both reach the INSERT step; the partial unique
-- index (team_assignments_one_open_per_project_employee) makes the LOSING
-- insert fail with a unique-violation error rather than silently creating
-- a duplicate open row — the application layer surfaces this as a
-- friendly "try again" conflict (modules/teams/actions.ts).
--
-- Eligibility (archived project/team, ineligible employee) is enforced by
-- team_assignments_validate_insert firing on the INSERT below — not
-- duplicated here, so a direct INSERT and an INSERT via this function are
-- always held to the identical rule.
--
-- SECURITY INVOKER: RLS on both tables still fully governs whether the
-- caller may do this — no elevation. The function exists for atomicity,
-- not for bypassing authorization.
create or replace function public.move_employee_to_team(
  target_project_id uuid,
  target_team_id uuid,
  target_employee_id uuid,
  target_role public.team_assignment_role default 'member',
  target_notes text default null
)
returns public.team_assignments
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_existing record;
  v_result public.team_assignments;
begin
  select * into v_existing
  from public.team_assignments
  where project_id = target_project_id
    and employee_id = target_employee_id
    and end_at is null
  for update;

  if found then
    -- Already exactly this team/role — nothing to move.
    if v_existing.team_id = target_team_id and v_existing.assignment_role = target_role then
      return v_existing;
    end if;

    update public.team_assignments
    set end_at = v_now, ended_by = auth.uid(), ended_at = v_now
    where id = v_existing.id;
  end if;

  insert into public.team_assignments (
    organization_id, project_id, team_id, employee_id, assignment_role, start_at, assigned_by, notes
  )
  select organization_id, target_project_id, target_team_id, target_employee_id, target_role, v_now, auth.uid(), target_notes
  from public.teams
  where id = target_team_id
  returning * into v_result;

  if v_result.id is null then
    raise exception 'team % not found', target_team_id;
  end if;

  return v_result;
end;
$$;

comment on function public.move_employee_to_team(uuid, uuid, uuid, public.team_assignment_role, text) is
  'Atomically closes target_employee_id''s current open team_assignments row in target_project_id (any team) and opens a new one in target_team_id, using one shared timestamp for both halves — the only path that changes team membership. SECURITY INVOKER: subject to team_assignments RLS and its INSERT-time eligibility/no-overlap triggers exactly as a direct insert/update would be.';

revoke all on function public.move_employee_to_team(uuid, uuid, uuid, public.team_assignment_role, text) from public, anon;
grant execute on function public.move_employee_to_team(uuid, uuid, uuid, public.team_assignment_role, text) to authenticated;

-- ── 10) end_team_assignment ───────────────────────────────────────────
-- Removing an employee from a team entirely (no replacement team) — closes
-- the open row without opening a new one. A thin wrapper kept separate from
-- move_employee_to_team() rather than overloading it with a nullable
-- target_team_id, so "remove" and "move" stay two clearly distinct,
-- unambiguous call sites in application code.
create or replace function public.end_team_assignment(target_project_id uuid, target_employee_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  update public.team_assignments
  set end_at = now(), ended_by = auth.uid(), ended_at = now()
  where project_id = target_project_id
    and employee_id = target_employee_id
    and end_at is null;
end;
$$;

revoke all on function public.end_team_assignment(uuid, uuid) from public, anon;
grant execute on function public.end_team_assignment(uuid, uuid) to authenticated;

-- ── 11) close_orphaned_team_assignment ───────────────────────────────
-- When an employee's LAST open project_assignments row for a project
-- closes, they no longer have any standing on that project's roster —
-- automatically close their open team_assignments row in that same
-- project too, using the SAME actor/timestamp already recorded on the
-- project_assignments row that triggered this. Without this, an employee
-- could remain "actively on a team" with zero project roster standing, an
-- orphaned state the Team Assignment Selector's own eligibility rule
-- ("only employees assigned to the project") is supposed to make
-- impossible. SECURITY DEFINER: whoever is authorized to close a
-- project_assignments row is, by construction, also authorized to close a
-- team_assignments row in that same project (both share the identical
-- "org-wide manager or this project's PM" RLS gate) — DEFINER removes any
-- doubt/fragility rather than relying on that equivalence holding exactly
-- at the moment this fires.
create or replace function public.close_orphaned_team_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.end_at is null or old.end_at is not null then
    return new;
  end if;

  if exists (
    select 1 from public.project_assignments
    where project_id = new.project_id and employee_id = new.employee_id and end_at is null
  ) then
    return new;
  end if;

  update public.team_assignments
  set end_at = new.end_at, ended_by = new.ended_by, ended_at = new.ended_at
  where project_id = new.project_id and employee_id = new.employee_id and end_at is null;

  return new;
end;
$$;

comment on function public.close_orphaned_team_assignment() is
  'Fires after a project_assignments row closes; if that was the employee''s last open project_assignments row for the project, also closes their open team_assignments row there — prevents an employee remaining actively on a team after losing all project roster standing.';

create trigger project_assignments_close_orphaned_team_assignment
  after update on public.project_assignments
  for each row execute function public.close_orphaned_team_assignment();

-- ── 12) save_team_with_assignments ───────────────────────────────────
-- Wraps the Team dialog's entire submit — create-or-update the team's own
-- fields, then apply every assignment change (move/assign/remove) — in one
-- function call, one transaction. Without this, "team saved but an
-- assignment change failed" or "some members moved, others didn't" were
-- both reachable states from the application layer issuing several
-- separate Server Function calls in sequence. `target_assignments` is a
-- JSON array of `{"employee_id": "<uuid>", "role": "member"|"foreman"|"none"}`
-- — "none" removes the employee from this team (end_team_assignment),
-- anything else assigns/moves them (move_employee_to_team). Reuses those
-- same two functions internally rather than duplicating their logic, so
-- there is exactly one implementation of "what closing/opening a team
-- assignment means."
--
-- ARCHIVED-TEAM INVARIANT (Final Milestone 4 correction): an archived team
-- must have no open team_assignments — ever, regardless of how the
-- archival was requested. Rather than letting whichever guard happens to
-- fire first (the assignment-insert-into-archived-team check, or the
-- teams status-change check) reject the transaction with whichever
-- message applies to that code path, this function computes the FINAL set
-- of employees who would be on the team AFTER target_assignments is
-- applied — current open assignments, minus every employee whose
-- requested role is 'none', plus every employee whose requested role is
-- 'member'/'foreman' — entirely from data already on hand, before writing
-- anything. If target_status = 'archived' and that final set is non-empty,
-- the whole call is rejected up front with one clear, consistent message.
-- This is evaluated identically for create (target_team_id null — the
-- "current open assignments" half is naturally empty, since the team
-- doesn't exist yet) and update, and does not depend on whether this
-- function happens to apply assignment changes before or after the status
-- field internally — the check runs before either.
--
-- The underlying database-level guards (teams_validate_status_change,
-- team_assignments_validate_insert's archived-team check) are UNCHANGED
-- and remain the real backstop for any direct SQL or future code path
-- that bypasses this function entirely — this upfront check exists purely
-- to give THIS function's callers one reliable, friendly message instead
-- of relying on whichever lower-level trigger happens to fire first.
--
-- SECURITY INVOKER: every internal write (the teams insert/update, and
-- each move_employee_to_team()/end_team_assignment() call) is still fully
-- subject to its own table's RLS — this function adds atomicity, not
-- privilege.
create or replace function public.save_team_with_assignments(
  target_team_id uuid,
  target_project_id uuid,
  target_name text,
  target_code text,
  target_color public.team_color,
  target_description text,
  target_status public.team_status,
  target_assignments jsonb default '[]'::jsonb
)
returns public.teams
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_organization_id uuid;
  v_next_order integer;
  v_team public.teams;
  v_change record;
  v_final_open_count integer;
begin
  select organization_id into v_organization_id from public.projects where id = target_project_id;
  if v_organization_id is null then
    raise exception 'project % not found', target_project_id;
  end if;

  if target_status = 'archived' then
    select count(*) into v_final_open_count
    from (
      -- Currently-open team members NOT explicitly touched by this submit —
      -- they carry over unchanged. (Empty for create: target_team_id is
      -- null, so this matches no rows.)
      select ta.employee_id
      from public.team_assignments ta
      where ta.team_id = target_team_id
        and ta.end_at is null
        and not exists (
          select 1 from jsonb_array_elements(target_assignments) elem
          where (elem ->> 'employee_id')::uuid = ta.employee_id
        )
      union
      -- Employees this submit explicitly assigns/moves onto the team.
      select (elem ->> 'employee_id')::uuid
      from jsonb_array_elements(target_assignments) elem
      where elem ->> 'role' <> 'none'
    ) as final_members;

    if v_final_open_count > 0 then
      raise exception 'A team cannot be archived while it has assigned employees. Remove all current assignments first.';
    end if;
  end if;

  if target_team_id is null then
    -- Create: no existing assignments can possibly conflict with the
    -- requested status yet, so the insert can set it directly.
    select coalesce(max(display_order), -1) + 1 into v_next_order
    from public.teams
    where project_id = target_project_id;

    insert into public.teams (
      organization_id, project_id, name, code, color, description, status, display_order, created_by, updated_by
    )
    values (
      v_organization_id, target_project_id, target_name, target_code, target_color, target_description, target_status, v_next_order, auth.uid(), auth.uid()
    )
    returning * into v_team;

    for v_change in select * from jsonb_to_recordset(target_assignments) as x(employee_id uuid, role text)
    loop
      if v_change.role = 'none' then
        perform public.end_team_assignment(target_project_id, v_change.employee_id);
      else
        perform public.move_employee_to_team(target_project_id, v_team.id, v_change.employee_id, v_change.role::public.team_assignment_role);
      end if;
    end loop;
  else
    -- Update: apply assignment changes before the status change. The
    -- archived-team invariant itself is already guaranteed by the upfront
    -- check above regardless of this ordering — this sequencing just keeps
    -- teams_validate_status_change (the database-level backstop) reading
    -- the already-cleared state too, rather than raising its own (less
    -- specific) rejection first in the archive-while-clearing-members case.
    for v_change in select * from jsonb_to_recordset(target_assignments) as x(employee_id uuid, role text)
    loop
      if v_change.role = 'none' then
        perform public.end_team_assignment(target_project_id, v_change.employee_id);
      else
        perform public.move_employee_to_team(target_project_id, target_team_id, v_change.employee_id, v_change.role::public.team_assignment_role);
      end if;
    end loop;

    update public.teams
    set name = target_name, code = target_code, color = target_color, description = target_description, status = target_status, updated_by = auth.uid()
    where id = target_team_id and project_id = target_project_id
    returning * into v_team;

    if v_team.id is null then
      raise exception 'team % not found in project %', target_team_id, target_project_id;
    end if;
  end if;

  return v_team;
end;
$$;

comment on function public.save_team_with_assignments(uuid, uuid, text, text, public.team_color, text, public.team_status, jsonb) is
  'Atomic create-or-update of a team plus every assignment change from the Team dialog, in one transaction — the Team dialog''s sole write path (modules/teams/actions.ts). target_team_id null = create. Rejects up front, before any write, a requested final state of archived with one or more employees still assigned — see this function''s header comment for how "final state" is computed independent of internal operation ordering.';

revoke all on function public.save_team_with_assignments(uuid, uuid, text, text, public.team_color, text, public.team_status, jsonb) from public, anon;
grant execute on function public.save_team_with_assignments(uuid, uuid, text, text, public.team_color, text, public.team_status, jsonb) to authenticated;

-- ── 13) reorder_teams ─────────────────────────────────────────────────
-- Writes every team's new display_order in one transaction, rather than
-- the application issuing N separate UPDATE round trips (which could
-- leave a partially-applied order if one failed mid-sequence, or race
-- against a second concurrent reorder). Silently ignores any id in
-- target_team_ids that isn't actually a team of target_project_id (rather
-- than failing the whole batch) — the application always passes the
-- server's own just-fetched id list, so this is a defensive no-op path,
-- not an expected case.
create or replace function public.reorder_teams(target_project_id uuid, target_team_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- ordinality is 1-indexed; subtract 1 so display_order stays 0-indexed,
  -- matching save_team_with_assignments()'s "next order" computation
  -- (coalesce(max(display_order), -1) + 1 — a brand-new project's first
  -- team gets display_order = 0).
  update public.teams
  set display_order = ordered.position - 1
  from unnest(target_team_ids) with ordinality as ordered (id, position)
  where public.teams.id = ordered.id
    and public.teams.project_id = target_project_id;
end;
$$;

revoke all on function public.reorder_teams(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_teams(uuid, uuid[]) to authenticated;

-- ── 14) RLS ───────────────────────────────────────────────────────────
-- Shared visibility shape: org-wide managers see everything; everyone else
-- needs an explicit, still-open project_assignments row OR an explicit,
-- still-open team_assignments row (in any team) for that specific project —
-- pure assignment-driven visibility, zero implicit "role X sees everything"
-- shortcuts, per docs/ROLES_AND_PERMISSIONS.md §2.
create or replace function public.has_project_access(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.project_assignments pa
    join public.employees e on e.id = pa.employee_id
    where pa.project_id = target_project_id and pa.end_at is null and e.profile_id = auth.uid()
  )
  or exists (
    select 1 from public.team_assignments ta
    join public.employees e on e.id = ta.employee_id
    where ta.project_id = target_project_id and ta.end_at is null and e.profile_id = auth.uid()
  );
$$;

comment on function public.has_project_access(uuid) is
  'True if the calling user has ANY current (end_at is null) project_assignments or team_assignments row (any role, including plain member/employee) for target_project_id. SECURITY DEFINER for the same reason as is_organization_member()/has_organization_role() (20260725090800_rls_helper_functions.sql) — called from within RLS policies on projects/teams/employees, so a SECURITY INVOKER version would re-trigger those same policies. The org-wide-manager shortcut (company_admin/operations_manager see every project) is intentionally NOT folded in here — every policy below ORs this with has_any_organization_role(...) explicitly, so the "org-wide" and "explicitly assigned" branches stay visibly separate.';

revoke execute on function public.has_project_access(uuid) from public;
grant execute on function public.has_project_access(uuid) to authenticated;

-- Shared by every INSERT/UPDATE policy below that grants write access to
-- the project's own assigned Project Manager — a single definition rather
-- than repeating the same join six times across projects/teams/
-- project_assignments/team_assignments, matching why has_any_organization_role()
-- exists instead of an inline OR chain. SECURITY DEFINER for the same
-- reason as has_project_access() above.
create or replace function public.is_project_manager(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.project_assignments pa
    join public.employees e on e.id = pa.employee_id
    where pa.project_id = target_project_id
      and pa.assignment_role = 'project_manager'
      and pa.end_at is null
      and e.profile_id = auth.uid()
  );
$$;

comment on function public.is_project_manager(uuid) is
  'True if the calling user holds an active (end_at is null) project_assignments row with assignment_role = ''project_manager'' for target_project_id. Backs write access to projects/teams/project_assignments/team_assignments below — docs/ROLES_AND_PERMISSIONS.md''s Project Manager row: "manages a specific project ... and team assignments for that project."';

revoke execute on function public.is_project_manager(uuid) from public;
grant execute on function public.is_project_manager(uuid) to authenticated;

-- ── projects ──────────────────────────────────────────────────────────
alter table public.projects enable row level security;
alter table public.projects force row level security;

grant select, insert, update on public.projects to authenticated;

create policy projects_select
  on public.projects
  for select
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager'])
      or public.has_project_access(id)
    )
  );

-- Creating a project requires an org-wide role — a project must exist
-- before anyone can be assigned as its PM, so project creation itself can
-- never be delegated to an assignment that doesn't exist yet.
create policy projects_insert
  on public.projects
  for insert
  to authenticated
  with check (
    public.is_organization_member(organization_id)
    and public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager'])
  );

-- Editing core project fields: org-wide managers, or the project's own
-- assigned Project Manager (docs/ROLES_AND_PERMISSIONS.md's PM row: "Manages
-- a specific project ... and team assignments for that project"). Every
-- status transition, including into/out of 'archived', goes through this
-- same policy — there is no separate archive-specific policy.
create policy projects_update
  on public.projects
  for update
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(id)
    )
  )
  with check (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(id)
    )
  );

-- No DELETE policy, no DELETE grant — see projects.status's ''archived'' value.

-- ── project_assignments ───────────────────────────────────────────────
alter table public.project_assignments enable row level security;
alter table public.project_assignments force row level security;

grant select, insert, update on public.project_assignments to authenticated;

-- Same reader set as the project itself — if you can see the project you
-- can see its roster/manager assignments (this is how the roster becomes
-- visible in the first place, including to a plain member checking their
-- own project list).
create policy project_assignments_select
  on public.project_assignments
  for select
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager'])
      or public.has_project_access(project_id)
    )
  );

-- Managing the roster/manager assignments: org-wide managers, or the
-- project's own assigned Project Manager.
create policy project_assignments_insert
  on public.project_assignments
  for insert
  to authenticated
  with check (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
    )
  );

create policy project_assignments_update
  on public.project_assignments
  for update
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
    )
  )
  with check (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
    )
  );

-- No DELETE policy, no DELETE grant — history is preserved.

-- ── teams ─────────────────────────────────────────────────────────────
alter table public.teams enable row level security;
alter table public.teams force row level security;

grant select, insert, update on public.teams to authenticated;

create policy teams_select
  on public.teams
  for select
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager'])
      or public.has_project_access(project_id)
    )
  );

create policy teams_insert
  on public.teams
  for insert
  to authenticated
  with check (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
    )
  );

create policy teams_update
  on public.teams
  for update
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
    )
  )
  with check (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
    )
  );

-- No DELETE policy, no DELETE grant — see teams.status's ''archived'' value.

-- ── team_assignments ─────────────────────────────────────────────────
alter table public.team_assignments enable row level security;
alter table public.team_assignments force row level security;

grant select, insert, update on public.team_assignments to authenticated;

-- Same reader set as teams/projects — anyone who can see the project sees
-- its full current team structure (the Team Cards page's whole point is
-- "who is currently working in each team," not a per-row self-only view).
create policy team_assignments_select
  on public.team_assignments
  for select
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager'])
      or public.has_project_access(project_id)
    )
  );

create policy team_assignments_insert
  on public.team_assignments
  for insert
  to authenticated
  with check (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
    )
  );

create policy team_assignments_update
  on public.team_assignments
  for update
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
    )
  )
  with check (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
    )
  );

-- No DELETE policy, no DELETE grant — history is preserved; the Team Cards
-- UI simply never queries a closed (end_at is not null) row.

-- ── 15) employees: narrow, column-limited project/team-mate visibility ──
-- The ORIGINAL version of this migration granted a raw, full-row `employees`
-- SELECT policy to project/team-mates — PostgreSQL RLS restricts ROWS, not
-- COLUMNS, so that policy exposed work_email/phone/birth_date/
-- employment_status/account_status/created_by/updated_by to any teammate,
-- not just "basic" fields as its comment claimed. Replaced entirely: there
-- is NO raw RLS policy granting teammates row access to `employees` at
-- all. Instead, `get_basic_employee_info()` (defined after its own helper,
-- `is_project_teammate()`, below) is a SECURITY DEFINER function that
-- performs its own per-row authorization check and returns ONLY an
-- approved, narrow column set (id, first_name, last_name, position_title,
-- profile_id, archived_at — exactly what the Team Cards/Project
-- Assignments UI actually renders, no more). Every query in
-- modules/teams/queries.ts and modules/projects/queries.ts that resolves a
-- teammate's display info calls this function instead of
-- `.from("employees").select(...)`.
--
-- SECURITY DEFINER, same rationale as is_organization_member()/
-- has_organization_role() (20260725090800_rls_helper_functions.sql) —
-- queries `employees` and `project_assignments`/`team_assignments`, all
-- RLS-protected tables, so must bypass those policies to evaluate itself
-- rather than risk re-triggering them.
create or replace function public.is_project_teammate(target_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.employees caller
    where caller.profile_id = auth.uid()
      and (
        exists (
          select 1
          from public.project_assignments pa_caller
          join public.project_assignments pa_target
            on pa_target.project_id = pa_caller.project_id and pa_target.end_at is null
          where pa_caller.employee_id = caller.id
            and pa_caller.end_at is null
            and pa_target.employee_id = target_employee_id
        )
        or exists (
          select 1
          from public.team_assignments ta_caller
          join public.team_assignments ta_target
            on ta_target.project_id = ta_caller.project_id and ta_target.end_at is null
          where ta_caller.employee_id = caller.id
            and ta_caller.end_at is null
            and ta_target.employee_id = target_employee_id
        )
      )
  );
$$;

comment on function public.is_project_teammate(uuid) is
  'True if the calling user currently shares an active project (via project_assignments or team_assignments, either side) with target_employee_id. Backs get_basic_employee_info() only — never used to back a raw `employees` RLS policy (see this migration''s header point 1).';

revoke execute on function public.is_project_teammate(uuid) from public;
grant execute on function public.is_project_teammate(uuid) to authenticated;

create or replace function public.get_basic_employee_info(target_employee_ids uuid[])
returns table (
  id uuid,
  first_name text,
  last_name text,
  position_title text,
  profile_id uuid,
  archived_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id, e.first_name, e.last_name, e.position_title, e.profile_id, e.archived_at
  from public.employees e
  where e.id = any(target_employee_ids)
    and (
      e.profile_id = auth.uid()
      or public.has_any_organization_role(
        e.organization_id,
        array['company_admin', 'operations_manager', 'hseq_manager', 'project_manager', 'inspector', 'planner']
      )
      or public.is_project_teammate(e.id)
    );
$$;

comment on function public.get_basic_employee_info(uuid[]) is
  'THE safe channel for resolving a project/team-mate''s display info — narrow columns only (no work_email/phone/birth_date/employment_status/account_status/audit columns), with its own per-row authorization check (self, org-wide manager roles, or a shared-project teammate via is_project_teammate()). Rows the caller isn''t authorized to see are silently omitted, not errored. There is deliberately no RLS policy on `employees` granting teammates raw row access — see this migration''s header point 1.';

revoke execute on function public.get_basic_employee_info(uuid[]) from public;
grant execute on function public.get_basic_employee_info(uuid[]) to authenticated;
