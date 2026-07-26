-- Employment Lifecycle milestone — employee_employment_periods.
--
-- Single source of truth for "is this employee currently employed, and for
-- how long has this been true": an append-only-in-spirit, per-organization
-- timeline of employment periods for a given employees row. Supports one
-- employee having MULTIPLE periods over time within the same organization
-- (ended employment, then a later rehire), never a second `employees` row —
-- see docs/PRODUCT_REQUIREMENTS.md §11.4 for the (broader, not-yet-built)
-- future employment-history direction this is a first, narrower slice of.
--
-- `employees.employment_status` / `.start_date` / `.end_date` are NOT
-- removed — removing them would ripple through every existing read path
-- (the list, search_employees(), the status badges). Instead they become a
-- DERIVED SNAPSHOT of "the current or most recent period," kept in sync by
-- a trigger, and locked down at the column-privilege level so the app can
-- no longer write them directly — see §3 below. This is the mechanism that
-- keeps there from being two independent sources of truth for employment
-- state, per this milestone's explicit requirement.
--
-- Deliberately binary: an OPEN period (end_date is null) means
-- employment_status = 'active'; a CLOSED period means 'terminated'.
-- 'inactive'/'on_leave' remain valid enum values (untouched, not dropped)
-- but nothing in this migration or the application ever sets them anymore
-- — they're reserved for a possible future leave-of-absence feature (a
-- pause WITHIN an open period, a different concept from ending/rehiring),
-- not built this milestone.

-- ── 1) employment_end_reason ─────────────────────────────────────────
create type public.employment_end_reason as enum (
  'resigned',
  'terminated',
  'layoff',
  'end_of_contract',
  'other'
);

comment on type public.employment_end_reason is
  'Why an employment period was closed. Required whenever employee_employment_periods.end_date is set — see that table''s check constraint.';

-- ── 2) new audit_action values ───────────────────────────────────────
-- Distinct verbs rather than overloading 'update', matching this schema's
-- existing precedent (see 20260725091300_audit_action_archive.sql adding
-- 'archive' instead of overloading 'update' for the same reason). Not used
-- within this same migration file — see that file's header for why a
-- newly-added enum value can't be referenced in the transaction that adds
-- it.
alter type public.audit_action add value 'end_employment';
alter type public.audit_action add value 'rehire';

-- ── 3) employee_employment_periods ───────────────────────────────────
create table public.employee_employment_periods (
  id uuid primary key default gen_random_uuid(),
  -- Denormalized alongside employee_id (same pattern as
  -- membership_roles.organization_id) purely for RLS/index simplicity —
  -- always equal to the referenced employees row's organization_id, never
  -- independently settable (employees never change organization).
  organization_id uuid not null references public.organizations (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  start_date date not null,
  -- null = this period is currently open (the employee is presently
  -- employed under it). At most one open period per employee — see the
  -- partial unique index below. This is what makes "rehire" structurally
  -- safe: you cannot open a second period while one is already open.
  end_date date,
  end_reason public.employment_end_reason,
  end_note text,
  ended_by uuid references public.profiles (id) on delete set null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint employee_employment_periods_end_after_start check (
    end_date is null or end_date >= start_date
  ),
  -- end_date and end_reason are set together or not at all. ended_by/
  -- ended_at are deliberately NOT part of this constraint — the backfill
  -- below closes historical periods for pre-existing terminated employees
  -- without a real actor/timestamp to record, and fabricating one would be
  -- worse than leaving it null.
  constraint employee_employment_periods_end_fields_paired check (
    (end_date is null and end_reason is null) or (end_date is not null and end_reason is not null)
  )
);

comment on table public.employee_employment_periods is
  'Append-only-in-spirit timeline of employment periods per employee. The single source of truth for employment state — employees.employment_status/start_date/end_date are a synced snapshot derived from this table, never written directly by the application. See this migration''s header comment.';
comment on column public.employee_employment_periods.end_date is
  'Null means this period is currently open (the employee is presently employed under it). Closing a period (setting this) is the only content change ever allowed on an existing row — see employee_employment_periods_validate_update below.';

-- At most one OPEN period per employee — structurally prevents a rehire
-- while someone is still employed, and structurally guarantees "rehire"
-- can never mean "create a second employees row" (the employee_number,
-- which lives on employees, is therefore automatically reused, never
-- reissued).
create unique index employee_employment_periods_one_open_per_employee
  on public.employee_employment_periods (employee_id)
  where end_date is null;

create index employee_employment_periods_employee_id_idx
  on public.employee_employment_periods (employee_id, start_date desc);
create index employee_employment_periods_organization_id_idx
  on public.employee_employment_periods (organization_id);

create trigger employee_employment_periods_set_updated_at
  before update on public.employee_employment_periods
  for each row execute function public.set_updated_at();

-- ── 4) guard: only two UPDATE shapes are ever legal ──────────────────
-- (a) correcting the start_date of a still-open period, or (b) closing an
-- open period (end_date/end_reason set, start_date unchanged). Everything
-- else — editing a period that's already closed, reopening a closed one,
-- changing which employee/organization a row belongs to — is rejected
-- unconditionally. Combined with "no DELETE grant, no DELETE policy"
-- below, this is what makes period history not silently editable or
-- removable by ordinary organization users, per this milestone's
-- requirement.
create or replace function public.validate_employment_period_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.employee_id is distinct from old.employee_id
    or new.organization_id is distinct from old.organization_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'employment period identity/creation fields cannot be changed';
  end if;

  if old.end_date is not null then
    raise exception 'a closed employment period cannot be modified';
  end if;

  if new.end_date is null then
    -- Correction of the open period: only start_date may actually change.
    if new.end_reason is not null or new.end_note is not null or new.ended_by is not null or new.ended_at is not null then
      raise exception 'cannot set end-of-employment fields without also setting end_date';
    end if;
  else
    -- Closing the open period: start_date is fixed, a reason is required.
    if new.start_date is distinct from old.start_date then
      raise exception 'start_date cannot change when closing an employment period';
    end if;
    if new.end_reason is null then
      raise exception 'end_reason is required when closing an employment period';
    end if;
  end if;

  return new;
end;
$$;

create trigger employee_employment_periods_validate_update
  before update on public.employee_employment_periods
  for each row execute function public.validate_employment_period_update();

-- ── 4b) guard: a new/corrected period can never precede the employee's ──
-- own prior history. Runs on INSERT (the rehire/initial-period case) and
-- UPDATE (the open-period start_date correction case from §4) — in both
-- cases, new.start_date must fall strictly after every OTHER period this
-- employee already has on file. The one-open-period unique index already
-- prevents overlapping with an open period; this closes the remaining gap
-- (a new period dated to start before, or inside, an already-CLOSED one).
create or replace function public.validate_employment_period_no_overlap()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_latest_end date;
begin
  select max(end_date) into v_latest_end
  from public.employee_employment_periods
  where employee_id = new.employee_id
    and id is distinct from new.id;

  if v_latest_end is not null and new.start_date <= v_latest_end then
    raise exception 'a new employment period must start after the employee''s most recent employment period ended (%)', v_latest_end;
  end if;

  return new;
end;
$$;

create trigger employee_employment_periods_validate_no_overlap
  before insert or update on public.employee_employment_periods
  for each row execute function public.validate_employment_period_no_overlap();

-- ── 5) sync: periods → employees snapshot ────────────────────────────
-- SECURITY DEFINER because it must write employees.employment_status/
-- start_date/end_date, which §6 below revokes direct UPDATE access to for
-- `authenticated` — this function (owned by the migration-running role,
-- not authenticated) is the one exception, the same mechanism already used
-- for organization_employee_number_counters via allocate_employee_number().
create or replace function public.sync_employee_employment_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee_id uuid := new.employee_id;
  v_latest record;
begin
  select start_date, end_date
  into v_latest
  from public.employee_employment_periods
  where employee_id = v_employee_id
  order by start_date desc, created_at desc
  limit 1;

  update public.employees
  set
    start_date = v_latest.start_date,
    end_date = v_latest.end_date,
    employment_status = case when v_latest.end_date is null then 'active'::public.employment_status else 'terminated'::public.employment_status end,
    updated_by = coalesce(new.ended_by, new.created_by, updated_by)
  where id = v_employee_id;

  return new;
end;
$$;

comment on function public.sync_employee_employment_snapshot() is
  'Recomputes employees.employment_status/start_date/end_date from the employee''s current-or-latest employment_employment_periods row. The only writer of those three columns — see the column-privilege revoke below.';

create trigger employee_employment_periods_sync
  after insert or update on public.employee_employment_periods
  for each row execute function public.sync_employee_employment_snapshot();

-- ── 6) initial period on employee creation ───────────────────────────
-- Every employees row gets exactly one opening period automatically, using
-- whatever start_date the INSERT itself supplied (INSERT is unaffected by
-- §7's UPDATE-only column lockdown, so createEmployee()'s existing INSERT
-- payload — which already sends start_date — needs no change here).
-- SECURITY INVOKER: the same role that could just INSERT into employees
-- (employees_insert_managers) is, by design, also granted INSERT on
-- employee_employment_periods below — no elevation needed.
create or replace function public.create_initial_employment_period()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  insert into public.employee_employment_periods (organization_id, employee_id, start_date, created_by)
  values (new.organization_id, new.id, coalesce(new.start_date, current_date), new.created_by);
  return new;
end;
$$;

create trigger employees_create_initial_period
  after insert on public.employees
  for each row execute function public.create_initial_employment_period();

-- ── 7) lock employees.employment_status/start_date/end_date to the sync trigger only ──
-- Column-level privileges: REVOKE the blanket UPDATE grant this table had
-- (20260725091100_role_helper_and_employees_rls.sql) and re-GRANT it for
-- every column except these three. This is enforced regardless of RLS —
-- a direct `UPDATE employees SET employment_status = ...` from
-- `authenticated` now fails at the database, for every role, not just by
-- application convention. sync_employee_employment_snapshot() above still
-- writes them because it is SECURITY DEFINER, owned by a role this revoke
-- does not target.
revoke update on public.employees from authenticated;
grant update (
  first_name, last_name, work_email, phone, position_title,
  birth_date, account_status, archived_at, updated_by
) on public.employees to authenticated;

-- ── 8) RLS: employee_employment_periods ──────────────────────────────
alter table public.employee_employment_periods enable row level security;
alter table public.employee_employment_periods force row level security;

-- No DELETE grant at all — matches employees/audit_events. History is
-- never removed.
grant select, insert, update on public.employee_employment_periods to authenticated;

-- Same reader set as employees_select_managers_or_own_record (mirrors it
-- exactly so "can see the employee" and "can see their employment
-- history" never disagree), plus the employee's own linked record via a
-- lookup on employees.profile_id (this table has no profile_id column of
-- its own).
create policy employee_employment_periods_select
  on public.employee_employment_periods
  for select
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(
        organization_id,
        array['company_admin', 'operations_manager', 'hseq_manager', 'project_manager', 'inspector', 'planner']
      )
      or exists (
        select 1 from public.employees e
        where e.id = employee_employment_periods.employee_id
          and e.profile_id = auth.uid()
      )
    )
  );

-- Same write-role gate as employees_insert_managers/employees_update_managers
-- — only company_admin/operations_manager ever create or close a period.
create policy employee_employment_periods_insert
  on public.employee_employment_periods
  for insert
  to authenticated
  with check (
    public.is_organization_member(organization_id)
    and public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager'])
  );

create policy employee_employment_periods_update
  on public.employee_employment_periods
  for update
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager'])
  )
  with check (
    public.is_organization_member(organization_id)
    and public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager'])
  );

-- No DELETE policy — belt-and-suspenders with the missing DELETE grant
-- above, same pattern as audit_events/employees.

-- ── 9) backfill existing employees into an initial period ────────────
-- One period per existing employees row, derived from its CURRENT
-- employment_status/start_date/end_date. Anything not 'terminated' becomes
-- an OPEN period (matches this migration's binary active/terminated
-- model — a pre-existing 'inactive'/'on_leave' row is treated as
-- currently employed going forward, since neither state maps to a period
-- boundary under the new model). A 'terminated' row becomes a CLOSED
-- period; if it has no end_date on file, its start_date is used as a
-- last-resort fallback so the not-null-together constraint is satisfiable,
-- and end_reason is recorded as 'other' since the real historical reason
-- was never captured under the old model.
--
-- This INSERT fires employee_employment_periods_sync per row, which
-- immediately normalizes employees.employment_status/start_date/end_date
-- to match — including discarding any previously-possible self-
-- contradictory combination (e.g. employment_status = 'active' with a
-- stray end_date already set), which is exactly the kind of contradiction
-- this milestone exists to eliminate.
insert into public.employee_employment_periods (
  organization_id, employee_id, start_date, end_date, end_reason, created_by
)
select
  e.organization_id,
  e.id,
  coalesce(e.start_date, e.created_at::date),
  case when e.employment_status = 'terminated' then coalesce(e.end_date, e.start_date, e.created_at::date) else null end,
  case when e.employment_status = 'terminated' then 'other'::public.employment_end_reason else null end,
  e.created_by
from public.employees e;
