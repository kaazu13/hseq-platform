-- Focused fixes to Today's Teams (this milestone's items 4, 6, 7, 8, 9):
-- shift becomes a controlled, consistently-populated value (the root cause
-- of the reported "David assignable to two teams" bug — see below),
-- foreman-only enforcement at the database level, atomic team+foreman
-- creation, and display-order persistence for drag-reorder.
--
-- ROOT CAUSE of the double-assignment bug: daily_team_members_one_open_per_slot
-- (20260812090000) already enforces "at most one open row per (project,
-- work_date, shift, employee)" — but daily_teams.shift/daily_team_members.shift
-- were free TEXT (20260816090000's own deliberate, now-superseded scope
-- decision — "daily_teams.shift remains free text"). Two teams for the
-- same calendar day with inconsistently-entered shift strings (one "Day
-- Shift", the other blank/NULL, or any other mismatch) are, from the
-- unique index's point of view, DIFFERENT slots — so the same employee
-- could legitimately hold one open row in each, and
-- move_daily_team_member()'s "close the existing slot for this shift,
-- then open the new one" logic silently does nothing to the OTHER team's
-- row, because it isn't looking at the same slot at all. Converting shift
-- to the same controlled `lmra_shift` enum LMRA already uses (Instruction's
-- explicit "use the EXISTING controlled values") removes the ambiguity at
-- its source; the fixes below close the remaining UI/RPC gaps.

-- ============================================================================
-- 1) shift: text -> lmra_shift (same mapping convention as
--    20260816090000's own LMRA shift conversion, but preserving NULL for
--    legacy rows with no clean mapping — daily_teams/daily_team_members
--    shift stays NULLABLE; only NEW teams are required to supply one, via
--    create_daily_team_with_foreman() below).
-- ============================================================================
drop index public.daily_team_members_one_open_per_slot;

alter table public.daily_teams
  alter column shift type public.lmra_shift using (
    case
      when lower(btrim(coalesce(shift, ''))) in ('day', 'day shift') then 'day'::public.lmra_shift
      when lower(btrim(coalesce(shift, ''))) in ('night', 'night shift') then 'night'::public.lmra_shift
      when lower(btrim(coalesce(shift, ''))) in ('late', 'late shift') then 'late'::public.lmra_shift
      else null
    end
  );

alter table public.daily_team_members
  alter column shift type public.lmra_shift using (
    case
      when lower(btrim(coalesce(shift, ''))) in ('day', 'day shift') then 'day'::public.lmra_shift
      when lower(btrim(coalesce(shift, ''))) in ('night', 'night shift') then 'night'::public.lmra_shift
      when lower(btrim(coalesce(shift, ''))) in ('late', 'late shift') then 'late'::public.lmra_shift
      else null
    end
  );

comment on column public.daily_teams.shift is
  'Controlled (public.lmra_shift: day/night/late), same enum LMRA already uses. NULLABLE for legacy rows created before this constraint; create_daily_team_with_foreman() requires it for every NEW team. NULL still participates correctly in the one-open-slot-per-employee uniqueness below (coalesced to a single shared blank-shift slot), so legacy no-shift teams keep working, they just do not get the finer per-shift distinction.';

-- Postgres's built-in enum->text cast is STABLE, not IMMUTABLE (enum
-- labels can theoretically be renamed later), so it cannot appear in an
-- index expression at all (confirmed live: "functions in index expression
-- must be marked IMMUTABLE"). This tiny wrapper is IMMUTABLE by our own
-- explicit, deliberate declaration — safe because this enum's 3 labels
-- are fixed and never renamed in this codebase — and gives
-- coalesce()-with-a-shared-blank-slot behavior back for NULL shift.
create or replace function public.lmra_shift_sort_key(target_shift public.lmra_shift)
returns text
language sql
immutable
as $$
  select coalesce(target_shift::text, '');
$$;

comment on function public.lmra_shift_sort_key(public.lmra_shift) is
  'IMMUTABLE text projection of an lmra_shift value (or '''' for NULL), for use in index expressions where the built-in enum->text cast is disallowed (it is only STABLE). Used by daily_team_members_one_open_per_slot below.';

create unique index daily_team_members_one_open_per_slot
  on public.daily_team_members (project_id, work_date, public.lmra_shift_sort_key(shift), employee_id)
  where removed_at is null;

-- ============================================================================
-- 2) Foreman-role enforcement at the database level (item 7) — reuses
--    is_eligible_scaffold_foreman(), the SAME "holds the company foreman
--    role AND has an open Foreman team_assignments row on this project"
--    check the Scaffold Register's own foreman picker already relies on
--    (supabase/migrations/20260805090000_scaffold_team_and_dimensions.sql)
--    — "use the EXISTING role catalogue and identifiers," not a new one.
-- ============================================================================
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

  if new.role = 'foreman' and not public.is_eligible_scaffold_foreman(new.employee_id, new.company_id, new.project_id) then
    raise exception 'employee % does not hold the foreman role on this project and cannot be assigned as foreman', new.employee_id;
  end if;

  return new;
end;
$$;

comment on function public.validate_daily_team_member_insert() is
  'Phase A/B + this milestone''s item 7: blocks assigning a daily team FOREMAN slot to anyone who does not hold the project''s real foreman role (is_eligible_scaffold_foreman — reused, not reinvented). A "member"-role insert is unaffected. Combined with daily_team_members_one_open_per_slot above, this also means a foreman cannot end up heading two teams in the same (project, work_date, shift) slot — that would require two open rows for the same employee in the same slot, which the unique index already forbids regardless of role.';

-- ============================================================================
-- 3) Atomic "create team with foreman" (item 9) — a NEW team may no longer
--    be created without a valid, eligible foreman and a valid shift.
--    save_daily_team() itself is UNCHANGED (still used for renaming/
--    editing shift/work area/activity on an EXISTING team, and remains the
--    only way historical no-foreman teams stay editable/repairable).
-- ============================================================================
create or replace function public.create_daily_team_with_foreman(
  target_project_id uuid,
  target_work_date date,
  target_name text,
  target_shift public.lmra_shift,
  target_foreman_employee_id uuid,
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
  if target_name is null or btrim(target_name) = '' then
    raise exception 'a team name is required';
  end if;
  if target_shift is null then
    raise exception 'a shift is required';
  end if;
  if target_foreman_employee_id is null then
    raise exception 'a foreman is required';
  end if;

  select company_id into v_company_id from public.projects where id = target_project_id;
  if v_company_id is null then
    raise exception 'project % not found', target_project_id;
  end if;

  if not public.is_eligible_scaffold_foreman(target_foreman_employee_id, v_company_id, target_project_id) then
    raise exception 'the selected employee does not hold the foreman role on this project';
  end if;

  select coalesce(max(display_order), -1) + 1 into v_next_order
  from public.daily_teams
  where project_id = target_project_id and work_date = target_work_date;

  insert into public.daily_teams (company_id, project_id, work_date, name, shift, work_area, activity, display_order, created_by, updated_by)
  values (v_company_id, target_project_id, target_work_date, target_name, target_shift, target_work_area, target_activity, v_next_order, auth.uid(), auth.uid())
  returning * into v_team;

  -- Reuses move_daily_team_member()'s own atomic close-then-insert shape,
  -- though there is nothing to close for a brand-new team — this simply
  -- means the SAME eligibility/attendance-gating triggers
  -- (validate_daily_team_member_insert(), including the foreman check
  -- just added above) apply here too, never a second, divergent insert
  -- path.
  perform public.move_daily_team_member(target_project_id, target_work_date, v_team.id, target_foreman_employee_id, 'foreman');

  return v_team;
end;
$$;

comment on function public.create_daily_team_with_foreman(uuid, date, text, public.lmra_shift, uuid, text, text) is
  'The ONLY way to create a NEW Today''s Team (item 9) — team name, shift, and an eligible foreman are all required, atomically. save_daily_team() (unchanged) remains the edit path for an existing team''s own fields, and the only remaining way a foreman-less team can exist is a LEGACY one created before this migration — those still render and remain repairable via the existing "Assign foreman" flow.';

revoke all on function public.create_daily_team_with_foreman(uuid, date, text, public.lmra_shift, uuid, text, text) from public, anon;
grant execute on function public.create_daily_team_with_foreman(uuid, date, text, public.lmra_shift, uuid, text, text) to authenticated;

-- save_daily_team()'s target_shift becomes enum-typed too (edit path —
-- still optional/nullable, since an existing legacy team may legitimately
-- have no shift and this path must not force one).
drop function if exists public.save_daily_team(uuid, uuid, date, text, text, text, text);

create or replace function public.save_daily_team(
  target_daily_team_id uuid,
  target_project_id uuid,
  target_work_date date,
  target_name text,
  target_shift public.lmra_shift default null,
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

comment on function public.save_daily_team(uuid, uuid, date, text, public.lmra_shift, text, text) is
  'Edit path for an EXISTING team''s own fields (name/shift/work area/activity) — foreman-less creation via this function is still technically possible (target_daily_team_id is null branch), but the app only calls create_daily_team_with_foreman() for new teams going forward (item 9); this signature stays available for the create branch only as a safety net / historical-data repair path, never wired to the New Team UI.';

revoke all on function public.save_daily_team(uuid, uuid, date, text, public.lmra_shift, text, text) from public, anon;
grant execute on function public.save_daily_team(uuid, uuid, date, text, public.lmra_shift, text, text) to authenticated;

-- ============================================================================
-- 4) Drag-and-drop display order (item 4) — display order is cosmetic
--    (which card renders first), never "historical evidence" the way
--    name/shift/work_area/activity are, so it is exempted from the
--    locked-team freeze — every OTHER field stays frozen exactly as
--    before.
-- ============================================================================
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
      or new.activity is distinct from old.activity then
      raise exception 'a locked daily team is frozen — unlock it first (unlock_daily_team()) to make a corrected, audited change';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.validate_daily_team_update() is
  'display_order is deliberately NOT in the locked-team freeze list (item 4) — reordering cards is a visual preference, never historical evidence, so it may change even on a locked day. Every other field stays frozen exactly as before.';

create or replace function public.reorder_daily_teams(target_project_id uuid, target_work_date date, target_ordered_team_ids uuid[])
returns setof public.daily_teams
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_team_id uuid;
  v_position integer := 0;
begin
  foreach v_team_id in array target_ordered_team_ids loop
    update public.daily_teams
    set display_order = v_position, updated_by = auth.uid()
    where id = v_team_id and project_id = target_project_id and work_date = target_work_date;
    v_position := v_position + 1;
  end loop;

  return query select * from public.daily_teams where project_id = target_project_id and work_date = target_work_date order by display_order;
end;
$$;

comment on function public.reorder_daily_teams(uuid, date, uuid[]) is
  'Persists drag-and-drop card order (item 4) — DISPLAY ORDER ONLY, changes nothing else about any team (membership/shift/foreman/work_area/activity/historical data all untouched). RLS on daily_teams (company_admin/operations_manager/the project''s own PM) is the real gate — same manage-tier as save_daily_team().';

revoke all on function public.reorder_daily_teams(uuid, date, uuid[]) from public, anon;
grant execute on function public.reorder_daily_teams(uuid, date, uuid[]) to authenticated;

-- ============================================================================
-- 5) move_daily_team_member() — v_shift was declared `text` and compared
--    via coalesce(shift, ''); both break now that shift is enum-typed.
--    Behavior is otherwise byte-for-byte identical (same atomic
--    close-existing-slot-then-open-new-slot shape).
-- ============================================================================
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
  v_shift public.lmra_shift;
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
    and coalesce(shift::text, '') = coalesce(v_shift::text, '')
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
  'The one and only way daily team membership changes (modules/daily-workforce/actions.ts) — atomically closes the employee''s current open slot for this (project, work_date, SHIFT) in any team and opens one on target_daily_team_id. Mirrors move_employee_to_team()''s exact shape. Both the close and the eligibility/attendance-gating checks on the new insert go through the normal triggers/RLS — this function adds atomicity only, no elevation. shift is now enum-typed (item 4-9''s shift fix) — comparison unchanged in spirit, just cast-safe.';

revoke all on function public.move_daily_team_member(uuid, date, uuid, uuid, public.team_assignment_role) from public, anon;
grant execute on function public.move_daily_team_member(uuid, date, uuid, uuid, public.team_assignment_role) to authenticated;
