-- Daily Workforce / Attendance + Today's Teams (Phases A, B, C) — a new,
-- date-scoped workforce layer that Today's Teams, Worked Hours, the
-- Employee Dashboard, Safety Observations, LMRA, and Toolbox Meetings will
-- all depend on.
--
-- Deliberately a NEW pair of tables (daily_attendance, daily_teams +
-- daily_team_members), not a repurposing of the existing teams/
-- team_assignments tables — a "Today's Team" is a genuinely new instance
-- per (project, work_date), never the same row edited across days (see
-- daily_teams_project_date_name_key below and the Phase G observation-
-- targeting migration's header comment on why that distinction matters:
-- "do not dynamically attach an observation to future members of a team
-- with the same name"). teams/team_assignments are left completely
-- untouched — existing data is preserved, nothing is deleted or migrated
-- into the new tables (a permanent "Team Alpha" row was never actually a
-- specific day's attendance record, and treating it as one would fabricate
-- history that never happened). The existing "Teams" nav item/route is
-- repointed to render Today's Teams instead (an app-layer change, not a
-- schema one) — see components/app-shell/nav-config.ts.
--
-- Every new table/trigger/RPC in this migration mirrors the proven shape
-- already established by teams/team_assignments/project_assignments
-- (20260728090000_projects_and_teams.sql): "current" = a nullable
-- close-timestamp column being null, closing sets three columns together
-- and never deletes/reopens, a partial unique index expresses "at most one
-- open X," and a single SECURITY INVOKER RPC performs any multi-row
-- atomic change so RLS on every underlying table still fully governs it.

-- ============================================================================
-- 1) daily_attendance — Phase A
-- ============================================================================
create type public.daily_attendance_status as enum (
  'not_set', 'present', 'absent', 'sick', 'leave', 'training', 'off_site'
);

comment on type public.daily_attendance_status is
  'Per (project, employee, work_date) daily status. ''not_set'' and ''present'' PERMIT working (may be assigned to a Today''s Team); every other value BLOCKS it — see daily_attendance_permits_work() below, the single source of truth this rule is derived from (never duplicated inline). ''not_set'' is stored explicitly (not merely "no row") so a manager can deliberately clear a prior status back to unknown, with the same created_by/updated_by audit trail as any other status change — see this migration''s header comment on why a sparse "no row = not set" model was rejected.';

create table public.daily_attendance (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null,
  employee_id uuid not null,
  work_date date not null,
  status public.daily_attendance_status not null default 'not_set',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  -- Composite FKs — same organization-boundary guarantee as
  -- project_assignments/team_assignments: this row can never reference a
  -- project or employee belonging to a different company than it claims.
  constraint daily_attendance_project_fk foreign key (project_id, company_id) references public.projects (id, company_id) on delete cascade,
  constraint daily_attendance_employee_fk foreign key (employee_id, company_id) references public.employees (id, company_id) on delete cascade,
  -- Exactly one status per (project, employee, work_date) — set via upsert
  -- (set_daily_attendance_status() below), never a raw insert from the app.
  constraint daily_attendance_one_per_employee_project_date unique (project_id, employee_id, work_date)
);

comment on table public.daily_attendance is
  'A specific employee''s workforce-availability status on a specific project on a specific calendar date. Entirely separate from project_assignments/team_assignments (this milestone''s explicit "do not modify the employee''s general project assignment/membership when changing daily status" requirement) — a daily_attendance row never opens, closes, or otherwise touches either of those tables. History is permanent: rows are never deleted, and past dates remain fully queryable (this milestone''s "preserve historical dates" requirement) — there is deliberately no DELETE grant, matching every other evidentiary table in this schema.';

create index daily_attendance_project_date_idx on public.daily_attendance (project_id, work_date);
create index daily_attendance_employee_date_idx on public.daily_attendance (employee_id, work_date);
create index daily_attendance_company_id_idx on public.daily_attendance (company_id);

create trigger daily_attendance_set_updated_at
  before update on public.daily_attendance
  for each row execute function public.set_updated_at();

-- The single source of truth for "does this status permit being assigned
-- to a Today's Team" — daily_team_members' insert trigger below calls this
-- (never re-derives the rule inline), and modules/daily-workforce/types.ts's
-- TS-side constant is kept in exact sync with this list by hand (documented
-- there) since there is no practical way to share one literal list between
-- Postgres and TypeScript in this codebase's toolchain.
create or replace function public.daily_attendance_permits_work(target_status public.daily_attendance_status)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select target_status in ('not_set', 'present');
$$;

create or replace function public.validate_daily_attendance_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.assert_project_not_archived(new.project_id);
  perform public.assert_employee_eligible_for_assignment(new.employee_id);
  return new;
end;
$$;

create trigger daily_attendance_validate_insert
  before insert on public.daily_attendance
  for each row execute function public.validate_daily_attendance_insert();

-- Identity fields (company/project/employee/work_date/created_at/created_by)
-- are immutable once set — only status/note (and the audit columns
-- set_updated_at() already maintains) may change, via upsert.
create or replace function public.validate_daily_attendance_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.project_id is distinct from old.project_id
    or new.employee_id is distinct from old.employee_id
    or new.work_date is distinct from old.work_date
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'daily attendance identity/creation fields cannot be changed';
  end if;
  return new;
end;
$$;

create trigger daily_attendance_validate_update
  before update on public.daily_attendance
  for each row execute function public.validate_daily_attendance_update();

alter table public.daily_attendance enable row level security;
alter table public.daily_attendance force row level security;

grant select, insert, update on public.daily_attendance to authenticated;

-- Reader set is intentionally NARROWER than teams/team_assignments: a plain
-- employee (no elevated role) may only see their OWN status row, matching
-- this milestone's explicit "Employee: view own assignment/status/hours"
-- direction — Foreman/HSE Officer/Inspector additionally see every row for
-- a project they have access to (necessary for the worker picker's
-- available/unavailable distinction and for HSE oversight); org-wide
-- managers and the project's own PM see everything for their scope.
create policy daily_attendance_select
  on public.daily_attendance
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or (public.has_project_access(project_id) and public.has_any_company_role(company_id, array['project_manager', 'hseq_manager', 'hse_officer', 'inspector', 'foreman']))
      or exists (select 1 from public.employees e where e.id = daily_attendance.employee_id and e.profile_id = auth.uid())
    )
  );

-- Only company-wide managers or the project's own assigned Project Manager
-- may SET a status — matches this milestone's explicit "Administrator /
-- Project Manager: manage daily workforce" direction. Foreman is
-- deliberately excluded here (Foreman's write access is scoped to their
-- own team's membership, via daily_team_members, not to attendance status
-- itself — see this migration's header comment on that judgment call).
create policy daily_attendance_insert
  on public.daily_attendance
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
    )
  );

create policy daily_attendance_update
  on public.daily_attendance
  for update
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
    )
  )
  with check (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
    )
  );

-- No DELETE policy, no DELETE grant — past dates are never removed.

-- ============================================================================
-- 2) daily_teams / daily_team_members — Phase B (+ Phase C lock columns,
--    added here rather than a separate migration since a daily_teams row
--    is never valid without them from the start)
-- ============================================================================
create type public.daily_team_status as enum ('open', 'locked');

create table public.daily_teams (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null,
  work_date date not null,
  name text not null,
  shift text,
  work_area text,
  activity text,
  status public.daily_team_status not null default 'open',
  display_order integer not null default 0,
  -- Phase C lock lifecycle. Locking is the normal end-of-day action;
  -- unlocking is the exceptional, audited correction path — see
  -- unlock_daily_team()/lock_daily_team() below.
  locked_at timestamptz,
  locked_by uuid references public.profiles (id) on delete set null,
  unlocked_at timestamptz,
  unlocked_by uuid references public.profiles (id) on delete set null,
  unlock_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  constraint daily_teams_name_not_blank check (btrim(name) <> ''),
  constraint daily_teams_project_fk foreign key (project_id, company_id) references public.projects (id, company_id) on delete cascade,
  constraint daily_teams_lock_fields_paired check ((locked_at is null) = (locked_by is null)),
  constraint daily_teams_unlock_reason_required check (unlocked_at is null or (unlock_reason is not null and btrim(unlock_reason) <> '')),
  -- Enables the composite FK from daily_team_members below.
  constraint daily_teams_id_project_company_key unique (id, project_id, company_id),
  constraint daily_teams_id_company_key unique (id, company_id)
);

comment on table public.daily_teams is
  'A single day''s workforce team on a project — Team A200 for 10 Aug 2026 is a WHOLLY DIFFERENT row than Team A200 for 11 Aug 2026, never the same row edited across days (unique index on (project_id, work_date, name) below). This is the deliberate, load-bearing difference from the older, persistent teams table (which this table does not replace, extend, or migrate data from). status=locked freezes the day''s allocation as historical evidence (Phase C) — see validate_daily_team_members_write_allowed() below for how membership changes are actually blocked once locked.';

create unique index daily_teams_project_date_name_key on public.daily_teams (project_id, work_date, name);
create index daily_teams_project_date_idx on public.daily_teams (project_id, work_date, display_order);
create index daily_teams_company_id_idx on public.daily_teams (company_id);

create trigger daily_teams_set_updated_at
  before update on public.daily_teams
  for each row execute function public.set_updated_at();

create or replace function public.validate_daily_team_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.assert_project_not_archived(new.project_id);
  new.status := 'open';
  new.locked_at := null;
  new.locked_by := null;
  new.unlocked_at := null;
  new.unlocked_by := null;
  new.unlock_reason := null;
  return new;
end;
$$;

create trigger daily_teams_validate_insert
  before insert on public.daily_teams
  for each row execute function public.validate_daily_team_insert();

-- Once locked, a daily_teams row's own descriptive fields (name/shift/
-- work_area/activity) are frozen too — not just its members (see the
-- daily_team_members trigger below) — "locking preserves the day's
-- workforce allocation as historical evidence" means the team's own
-- metadata is evidence too, not just its roster. Only the lock/unlock
-- lifecycle columns themselves may change, exclusively via
-- lock_daily_team()/unlock_daily_team() below (never a raw UPDATE from the
-- app — see those functions' SECURITY INVOKER + explicit column-set
-- pattern, mirroring finalize_scaffold_inspection()'s shape).
create or replace function public.validate_daily_team_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.project_id is distinct from old.project_id
    or new.work_date is distinct from old.work_date
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'daily team identity/creation fields cannot be changed';
  end if;

  if old.status = 'locked' and new.status = 'locked' then
    if new.name is distinct from old.name
      or new.shift is distinct from old.shift
      or new.work_area is distinct from old.work_area
      or new.activity is distinct from old.activity
      or new.display_order is distinct from old.display_order then
      raise exception 'a locked daily team is frozen — unlock it first (unlock_daily_team()) to make a corrected, audited change';
    end if;
  end if;

  return new;
end;
$$;

create trigger daily_teams_validate_update
  before update on public.daily_teams
  for each row execute function public.validate_daily_team_update();

-- RLS on daily_teams is set up further below, AFTER daily_team_members
-- exists — daily_teams_select's own-team-membership branch needs to query
-- daily_team_members, which doesn't exist yet at this point in the file.

create table public.daily_team_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null,
  work_date date not null,
  daily_team_id uuid not null,
  employee_id uuid not null,
  role public.team_assignment_role not null default 'member',
  -- Denormalized from the parent daily_teams row at insert time, kept in
  -- sync by sync_daily_team_member_shift() below — required so "at most
  -- one team per (project, date, SHIFT)" (this milestone's explicit
  -- per-shift scoping) can be a single partial unique index rather than a
  -- cross-table constraint, exactly mirroring why team_assignments
  -- denormalizes project_id from team_id.
  shift text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  removed_at timestamptz,
  removed_by uuid references public.profiles (id) on delete set null,
  constraint daily_team_members_team_fk foreign key (daily_team_id, project_id, company_id) references public.daily_teams (id, project_id, company_id) on delete cascade,
  constraint daily_team_members_employee_fk foreign key (employee_id, company_id) references public.employees (id, company_id) on delete cascade,
  constraint daily_team_members_removed_fields_paired check ((removed_at is null) = (removed_by is null))
);

comment on table public.daily_team_members is
  'Which daily_teams row, if any, an employee belongs to for one (project, work_date, shift). At most one OPEN (removed_at is null) row per (project, work_date, shift, employee) — the database expression of "a worker may belong to at most one normal daily team for the same project/date/shift" — enforced by the partial unique index below. Moving a worker between teams is always close-then-insert, performed atomically by move_daily_team_member() so the underlying (project, date, shift, employee) slot is never briefly held by two rows or by none in a way that could race with a concurrent insert.';

-- ── daily_teams RLS (deferred to here so the own-membership branch below
-- can reference daily_team_members, which now exists) ──────────────────
alter table public.daily_teams enable row level security;
alter table public.daily_teams force row level security;

grant select, insert, update on public.daily_teams to authenticated;

-- A plain employee sees only the specific team(s) they are (or were,
-- today) a member of — matches "Employee: view own team" — everyone with
-- broader project standing (PM/HSE/Inspector/Foreman with project access,
-- or org-wide managers) sees the whole day's team layout, which the
-- worker-picker/coordination UI genuinely needs.
create policy daily_teams_select
  on public.daily_teams
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or (public.has_project_access(project_id) and public.has_any_company_role(company_id, array['project_manager', 'hseq_manager', 'hse_officer', 'inspector', 'foreman']))
      or exists (
        select 1 from public.daily_team_members dtm
        join public.employees e on e.id = dtm.employee_id
        where dtm.daily_team_id = daily_teams.id and e.profile_id = auth.uid()
      )
    )
  );

create policy daily_teams_insert
  on public.daily_teams
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
    )
  );

-- UPDATE covers both the PM/Admin's normal edits (name/shift/area/activity/
-- display_order while open) and lock_daily_teams()/unlock_daily_teams()'s
-- own writes — both paths require the same authority; a Foreman is
-- deliberately NOT granted UPDATE on daily_teams itself (their scope is
-- membership rows only, via daily_team_members' own policy below).
create policy daily_teams_update
  on public.daily_teams
  for update
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
    )
  )
  with check (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
    )
  );

-- No DELETE policy, no DELETE grant — a mistakenly created team is left in
-- place (empty, or renamed) rather than deleted; deletion would erase a
-- decision a manager actually made, which "preserve historical dates"/
-- "locking preserves ... historical evidence" both argue against even for
-- a same-day mistake.

create unique index daily_team_members_one_open_per_slot
  on public.daily_team_members (project_id, work_date, coalesce(shift, ''), employee_id)
  where removed_at is null;

create index daily_team_members_team_idx on public.daily_team_members (daily_team_id) where removed_at is null;
create index daily_team_members_employee_date_idx on public.daily_team_members (employee_id, work_date);
create index daily_team_members_company_id_idx on public.daily_team_members (company_id);

create or replace function public.sync_daily_team_member_shift()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  select shift into new.shift from public.daily_teams where id = new.daily_team_id;
  return new;
end;
$$;

create trigger daily_team_members_a_sync_shift
  before insert on public.daily_team_members
  for each row execute function public.sync_daily_team_member_shift();

-- The Phase A <-> Phase B integration point: an employee whose
-- daily_attendance status for this exact (project, work_date) does NOT
-- permit working (anything other than not_set/present) can never be
-- inserted into a daily team — enforced here, at the database level, never
-- relying on the UI alone to grey out the option (this milestone's
-- explicit "Enforce this BOTH in the UI and server/database-side"
-- requirement). Also blocks inserting into a LOCKED team, and reuses the
-- same project/employee eligibility guards every other assignment table
-- in this schema uses.
create or replace function public.validate_daily_team_member_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_team_status public.daily_team_status;
  v_attendance_status public.daily_attendance_status;
begin
  perform public.assert_project_not_archived(new.project_id);
  perform public.assert_employee_eligible_for_assignment(new.employee_id);

  select status into v_team_status from public.daily_teams where id = new.daily_team_id;
  if v_team_status is null then
    raise exception 'daily team % not found', new.daily_team_id;
  end if;
  if v_team_status = 'locked' then
    raise exception 'this daily team is locked and cannot receive new members — unlock it first';
  end if;

  select status into v_attendance_status
  from public.daily_attendance
  where project_id = new.project_id and employee_id = new.employee_id and work_date = new.work_date;

  if v_attendance_status is not null and not public.daily_attendance_permits_work(v_attendance_status) then
    raise exception 'employee % is marked % on % and cannot be assigned to a daily team', new.employee_id, v_attendance_status, new.work_date;
  end if;

  return new;
end;
$$;

create trigger daily_team_members_validate_insert
  before insert on public.daily_team_members
  for each row execute function public.validate_daily_team_member_insert();

-- Only closing (removed_at/removed_by) is a legal UPDATE — moving is
-- always close-then-insert via move_daily_team_member(), same shape as
-- team_assignments. Also blocks any write against a row belonging to an
-- already-LOCKED team (removal included) — a locked day's roster is fully
-- frozen, not just protected from new additions.
create or replace function public.validate_daily_team_member_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_team_status public.daily_team_status;
begin
  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.project_id is distinct from old.project_id
    or new.work_date is distinct from old.work_date
    or new.daily_team_id is distinct from old.daily_team_id
    or new.employee_id is distinct from old.employee_id
    or new.role is distinct from old.role
    or new.shift is distinct from old.shift
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'only removing a daily team member (removed_at/removed_by) is allowed';
  end if;

  if old.removed_at is not null then
    raise exception 'this daily team membership has already been removed and cannot be modified again';
  end if;

  select status into v_team_status from public.daily_teams where id = old.daily_team_id;
  if v_team_status = 'locked' then
    raise exception 'this daily team is locked — its roster is frozen';
  end if;

  return new;
end;
$$;

create trigger daily_team_members_validate_update
  before update on public.daily_team_members
  for each row execute function public.validate_daily_team_member_update();

alter table public.daily_team_members enable row level security;
alter table public.daily_team_members force row level security;

grant select, insert, update on public.daily_team_members to authenticated;

create policy daily_team_members_select
  on public.daily_team_members
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or (public.has_project_access(project_id) and public.has_any_company_role(company_id, array['project_manager', 'hseq_manager', 'hse_officer', 'inspector', 'foreman']))
      or exists (select 1 from public.employees e where e.id = daily_team_members.employee_id and e.profile_id = auth.uid())
    )
  );

-- Write access: company-wide managers, the project's own PM, OR the
-- specific daily_team's own Foreman (is_daily_team_foreman() below) — the
-- narrow, self-scoped grant behind this milestone's "Foreman: ... manage
-- their own team only" direction, deliberately mirroring the existing
-- self-scoped patterns already in this codebase (e.g.
-- can_close_scaffold_defect()'s "or is the responsible person" branch)
-- rather than broadening Foreman's access to every team. A Foreman still
-- cannot touch daily_attendance itself (see that table's own policies
-- above) or another team's membership.
create or replace function public.is_daily_team_foreman(target_daily_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.daily_team_members dtm
    join public.employees e on e.id = dtm.employee_id
    where dtm.daily_team_id = target_daily_team_id
      and dtm.role = 'foreman'
      and dtm.removed_at is null
      and e.profile_id = auth.uid()
  );
$$;

comment on function public.is_daily_team_foreman(uuid) is
  'True if the calling user holds an open (removed_at is null) daily_team_members row with role = ''foreman'' on target_daily_team_id. SECURITY DEFINER for the same reason as is_project_manager() — called from within RLS on daily_team_members itself. This is a deliberately narrow, single-team grant: it says nothing about any OTHER team, locked or open.';

revoke execute on function public.is_daily_team_foreman(uuid) from public;
grant execute on function public.is_daily_team_foreman(uuid) to authenticated;

create policy daily_team_members_insert
  on public.daily_team_members
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
      or (public.has_any_company_role(company_id, array['foreman']) and public.is_daily_team_foreman(daily_team_id))
    )
  );

create policy daily_team_members_update
  on public.daily_team_members
  for update
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
      or (public.has_any_company_role(company_id, array['foreman']) and public.is_daily_team_foreman(daily_team_id))
    )
  )
  with check (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
      or (public.has_any_company_role(company_id, array['foreman']) and public.is_daily_team_foreman(daily_team_id))
    )
  );

-- No DELETE policy, no DELETE grant — removal is always removed_at, never
-- a deleted row (the archive/lock story depends on every day's true
-- membership history, including removals, being reconstructable).

-- ============================================================================
-- 3) RPCs — atomic operations
-- ============================================================================

-- Phase A: the ONE way daily_attendance is ever written. Upserts the
-- status, and — this milestone's explicit "if a PM attempts to mark an
-- already-assigned employee unavailable ... remove them from that day's
-- team and update their daily status atomically" requirement — if the new
-- status does not permit working AND the employee currently holds an open
-- daily_team_members row for this exact (project, work_date) [any shift],
-- that membership is closed in the SAME transaction. The UI performs its
-- own pre-check (a plain SELECT) to show the confirmation dialog BEFORE
-- calling this — see modules/daily-workforce/actions.ts — but this
-- function enforces the atomic removal unconditionally regardless of
-- whether that confirmation happened, so "do not silently create
-- contradictory records" holds even if a caller bypasses the UI.
create or replace function public.set_daily_attendance_status(
  target_project_id uuid,
  target_employee_id uuid,
  target_work_date date,
  target_status public.daily_attendance_status,
  target_note text default null
)
returns table (attendance public.daily_attendance, removed_from_team_id uuid)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_attendance public.daily_attendance;
  v_removed_team_id uuid;
begin
  select company_id into v_company_id from public.projects where id = target_project_id;
  if v_company_id is null then
    raise exception 'project % not found', target_project_id;
  end if;

  insert into public.daily_attendance (company_id, project_id, employee_id, work_date, status, note, created_by, updated_by)
  values (v_company_id, target_project_id, target_employee_id, target_work_date, target_status, target_note, auth.uid(), auth.uid())
  on conflict (project_id, employee_id, work_date)
  do update set status = excluded.status, note = excluded.note, updated_by = auth.uid()
  returning * into v_attendance;

  if not public.daily_attendance_permits_work(target_status) then
    update public.daily_team_members
    set removed_at = now(), removed_by = auth.uid()
    where project_id = target_project_id
      and employee_id = target_employee_id
      and work_date = target_work_date
      and removed_at is null
    returning daily_team_id into v_removed_team_id;
  end if;

  return query select v_attendance, v_removed_team_id;
end;
$$;

comment on function public.set_daily_attendance_status(uuid, uuid, date, public.daily_attendance_status, text) is
  'The sole write path for daily_attendance (modules/daily-workforce/actions.ts). Atomically upserts the status and, if the new status blocks working, removes any open daily_team_members row for the same (project, employee, work_date) — the database-side half of "mark unavailable removes today''s team assignment atomically"; the app additionally shows a confirmation dialog BEFORE calling this when it detects the employee is currently assigned, but this function does the removal unconditionally regardless, so a contradictory state (unavailable + still on a team) can never persist even if that confirmation is skipped.';

revoke all on function public.set_daily_attendance_status(uuid, uuid, date, public.daily_attendance_status, text) from public, anon;
grant execute on function public.set_daily_attendance_status(uuid, uuid, date, public.daily_attendance_status, text) to authenticated;

-- Phase B: create-or-update a daily team's own fields, mirroring
-- save_team_with_assignments()'s "one function, one transaction" shape but
-- WITHOUT the assignment-bulk-editing half (daily_team_members changes go
-- through move_daily_team_member()/remove_daily_team_member() instead,
-- individually — Today's Teams' UI is a fast add/move/remove flow per
-- worker, not a big form submitted once, per this milestone's UX
-- direction).
create or replace function public.save_daily_team(
  target_daily_team_id uuid,
  target_project_id uuid,
  target_work_date date,
  target_name text,
  target_shift text default null,
  target_work_area text default null,
  target_activity text default null
)
returns public.daily_teams
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_next_order integer;
  v_team public.daily_teams;
begin
  select company_id into v_company_id from public.projects where id = target_project_id;
  if v_company_id is null then
    raise exception 'project % not found', target_project_id;
  end if;

  if target_daily_team_id is null then
    select coalesce(max(display_order), -1) + 1 into v_next_order
    from public.daily_teams
    where project_id = target_project_id and work_date = target_work_date;

    insert into public.daily_teams (company_id, project_id, work_date, name, shift, work_area, activity, display_order, created_by, updated_by)
    values (v_company_id, target_project_id, target_work_date, target_name, target_shift, target_work_area, target_activity, v_next_order, auth.uid(), auth.uid())
    returning * into v_team;
  else
    update public.daily_teams
    set name = target_name, shift = target_shift, work_area = target_work_area, activity = target_activity, updated_by = auth.uid()
    where id = target_daily_team_id and project_id = target_project_id and work_date = target_work_date
    returning * into v_team;

    if v_team.id is null then
      raise exception 'daily team % not found on % for project %', target_daily_team_id, target_work_date, target_project_id;
    end if;
  end if;

  return v_team;
end;
$$;

comment on function public.save_daily_team(uuid, uuid, date, text, text, text, text) is
  'Create-or-update a Today''s Team''s own fields (modules/daily-workforce/actions.ts). target_daily_team_id null = create. RLS/validate_daily_team_update() still fully govern (e.g. rejecting an edit to a locked team) — this is a thin convenience wrapper for atomic display_order allocation on create, not a privilege escalation.';

revoke all on function public.save_daily_team(uuid, uuid, date, text, text, text, text) from public, anon;
grant execute on function public.save_daily_team(uuid, uuid, date, text, text, text, text) to authenticated;

-- The one and only way daily team membership changes — mirrors
-- move_employee_to_team() exactly: atomically closes the employee's
-- current open slot for this (project, work_date, shift) [any team] and
-- opens a new one on target_daily_team_id, sharing one timestamp. Also the
-- entry point for a brand-new assignment (nothing to close).
create or replace function public.move_daily_team_member(
  target_project_id uuid,
  target_work_date date,
  target_daily_team_id uuid,
  target_employee_id uuid,
  target_role public.team_assignment_role default 'member'
)
returns public.daily_team_members
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_shift text;
  v_existing record;
  v_result public.daily_team_members;
begin
  select company_id, shift into v_company_id, v_shift from public.daily_teams where id = target_daily_team_id;
  if v_company_id is null then
    raise exception 'daily team % not found', target_daily_team_id;
  end if;

  select * into v_existing
  from public.daily_team_members
  where project_id = target_project_id
    and work_date = target_work_date
    and coalesce(shift, '') = coalesce(v_shift, '')
    and employee_id = target_employee_id
    and removed_at is null
  for update;

  if found then
    if v_existing.daily_team_id = target_daily_team_id and v_existing.role = target_role then
      return v_existing;
    end if;
    update public.daily_team_members
    set removed_at = now(), removed_by = auth.uid()
    where id = v_existing.id;
  end if;

  insert into public.daily_team_members (company_id, project_id, work_date, daily_team_id, employee_id, role, created_by)
  values (v_company_id, target_project_id, target_work_date, target_daily_team_id, target_employee_id, target_role, auth.uid())
  returning * into v_result;

  return v_result;
end;
$$;

comment on function public.move_daily_team_member(uuid, date, uuid, uuid, public.team_assignment_role) is
  'The one and only way daily team membership changes (modules/daily-workforce/actions.ts) — atomically closes the employee''s current open slot for this (project, work_date, SHIFT) in any team and opens one on target_daily_team_id. Mirrors move_employee_to_team()''s exact shape. Both the close and the eligibility/attendance-gating checks on the new insert go through the normal triggers/RLS — this function adds atomicity only, no elevation.';

revoke all on function public.move_daily_team_member(uuid, date, uuid, uuid, public.team_assignment_role) from public, anon;
grant execute on function public.move_daily_team_member(uuid, date, uuid, uuid, public.team_assignment_role) to authenticated;

-- Phase C: end-of-day lock. Freezes every open daily_team_members row's
-- team AND the daily_teams rows' own fields for that (project, work_date)
-- — a single call locks the whole day at once (the UI action is
-- "[ Lock Today's Teams ]", not per-team).
create or replace function public.lock_daily_teams(target_project_id uuid, target_work_date date)
returns setof public.daily_teams
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  return query
  update public.daily_teams
  set status = 'locked', locked_at = now(), locked_by = auth.uid()
  where project_id = target_project_id and work_date = target_work_date and status = 'open'
  returning *;
end;
$$;

comment on function public.lock_daily_teams(uuid, date) is
  'End-of-day "[ Lock Today''s Teams ]" action (modules/daily-workforce/actions.ts) — locks every currently-open daily_teams row for (project_id, work_date) in one statement/transaction. Once locked, validate_daily_team_update()/validate_daily_team_member_update() reject any further change to that day''s teams or membership except through unlock_daily_teams() below.';

revoke all on function public.lock_daily_teams(uuid, date) from public, anon;
grant execute on function public.lock_daily_teams(uuid, date) to authenticated;

-- The exceptional, audited correction path — reopens every locked
-- daily_teams row for (project, work_date) so a further change can be
-- made, recording who/when/why. Gated at the RLS layer exactly like any
-- other daily_teams UPDATE (company-wide manager or the project's own PM
-- — NOT a Foreman, even their own team) — a reason is mandatory
-- (daily_teams_unlock_reason_required check constraint), and the ORIGINAL
-- locked_at/locked_by are deliberately left untouched (so "originally
-- locked by/at" survives even after unlocking) — only unlocked_at/
-- unlocked_by/unlock_reason are newly set. Re-locking (lock_daily_teams()
-- again) naturally overwrites locked_at/locked_by with the re-lock's own
-- values while status returns to 'locked' — the audit trail this
-- milestone requires ("originally locked by/at, unlocked by/at, reason,
-- relocked by/at") is reconstructed from: this row''s current locked_at/
-- locked_by (= the most recent lock) plus audit_events (see the INSERT
-- below) for the full history of every lock/unlock cycle.
create or replace function public.unlock_daily_teams(target_project_id uuid, target_work_date date, target_reason text)
returns setof public.daily_teams
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
begin
  if target_reason is null or btrim(target_reason) = '' then
    raise exception 'a reason is required to unlock Today''s Teams for a day';
  end if;

  select company_id into v_company_id from public.projects where id = target_project_id;

  return query
  update public.daily_teams
  set status = 'open', unlocked_at = now(), unlocked_by = auth.uid(), unlock_reason = target_reason
  where project_id = target_project_id and work_date = target_work_date and status = 'locked'
  returning *;

  insert into public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, changes)
  select v_company_id, auth.uid(), 'update', 'daily_teams_day', target_project_id, jsonb_build_object('work_date', target_work_date, 'action', 'unlocked', 'reason', target_reason)
  where v_company_id is not null;
end;
$$;

comment on function public.unlock_daily_teams(uuid, date, text) is
  'The exceptional, audited correction path for a locked day (modules/daily-workforce/actions.ts) — requires a reason, reopens every locked daily_teams row for (project_id, work_date) to status=open, and writes an audit_events row recording the unlock. RLS on daily_teams (company-wide manager or the project''s own PM only — never a Foreman, even for their own team) is the real gate; this function does not elevate access.';

revoke all on function public.unlock_daily_teams(uuid, date, text) from public, anon;
grant execute on function public.unlock_daily_teams(uuid, date, text) to authenticated;
