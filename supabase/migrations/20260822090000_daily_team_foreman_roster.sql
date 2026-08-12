-- Milestone G: corrects the Foreman <-> Team model. Previous milestones
-- modeled "foreman" as a daily_team_members row (role='foreman'), which
-- meant daily_team_members_one_open_per_slot (one open row per employee
-- per project/date/shift) accidentally also capped a Foreman to ONE team
-- per shift — wrong: the real rule is "one team has exactly one
-- responsible Foreman", not "one Foreman has at most one team". A Foreman
-- routinely runs several crews on the same day/shift (Karl: Team 1, Team
-- 3, Team 4).
--
-- Fix: foreman_employee_id becomes a direct column on daily_teams —
-- decoupled entirely from daily_team_members, so the worker slot-
-- uniqueness index no longer touches Foremen at all. daily_team_members
-- goes back to being WORKERS ONLY going forward (existing historical
-- role='foreman' rows are left untouched as frozen evidence — never
-- rewritten — simply no longer the read path for "who is this team's
-- foreman").
--
-- Also new: daily_team_foreman_roster — which Foremen are part of a
-- project's Today's Teams structure for one work_date, independent of how
-- many teams (zero, one, or several) they have. Daily/project-scoped only
-- (item 10's explicit instruction) — never a permanent Foreman-team
-- relationship, nothing carries over between days automatically.

alter table public.daily_teams
  add column foreman_employee_id uuid;

alter table public.daily_teams
  add constraint daily_teams_foreman_fk foreign key (foreman_employee_id, company_id) references public.employees (id, company_id);

-- Backfill from the currently-open foreman-role membership row, if any —
-- read-model migration only; the daily_team_members rows themselves are
-- untouched.
update public.daily_teams dt
set foreman_employee_id = dtm.employee_id
from public.daily_team_members dtm
where dtm.daily_team_id = dt.id and dtm.role = 'foreman' and dtm.removed_at is null;

comment on column public.daily_teams.foreman_employee_id is
  'The team''s one responsible Foreman (milestone G) — a direct column, not a daily_team_members row, specifically so ONE Foreman may head MULTIPLE Today''s Teams for the same project/date/shift. Nullable only for legacy/broken historical repair; every team created via create_daily_team_for_foreman() requires one. daily_team_members holds worker (role=''member'') rows only going forward.';

create table public.daily_team_foreman_roster (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null,
  work_date date not null,
  foreman_employee_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint daily_team_foreman_roster_project_fk foreign key (project_id, company_id) references public.projects (id, company_id) on delete cascade,
  constraint daily_team_foreman_roster_employee_fk foreign key (foreman_employee_id, company_id) references public.employees (id, company_id) on delete cascade,
  constraint daily_team_foreman_roster_unique unique (project_id, work_date, foreman_employee_id)
);

comment on table public.daily_team_foreman_roster is
  'Milestone G, item 10: which Foremen are part of a project''s Today''s Teams structure for one work_date — independent of team count (zero, one, or several). Daily/project-scoped only, never a permanent Foreman-team relationship; a fresh row every day, nothing carries over automatically.';

-- Backfill: every team that already has a foreman implies that foreman
-- was operationally part of that day's roster.
insert into public.daily_team_foreman_roster (company_id, project_id, work_date, foreman_employee_id, created_by)
select distinct dt.company_id, dt.project_id, dt.work_date, dt.foreman_employee_id, dt.created_by
from public.daily_teams dt
where dt.foreman_employee_id is not null
on conflict (project_id, work_date, foreman_employee_id) do nothing;

alter table public.daily_team_foreman_roster enable row level security;
alter table public.daily_team_foreman_roster force row level security;

grant select, insert, delete on public.daily_team_foreman_roster to authenticated;

-- Same visibility shape as daily_teams_select — anyone who can see the
-- day's teams can see who is on the Foreman roster.
create policy daily_team_foreman_roster_select
  on public.daily_team_foreman_roster
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or (public.has_project_access(project_id) and public.has_any_company_role(company_id, array['project_manager', 'hseq_manager', 'hse_officer', 'inspector', 'foreman']))
      or exists (select 1 from public.employees e where e.id = daily_team_foreman_roster.foreman_employee_id and e.profile_id = auth.uid())
    )
  );

-- Same manage-tier as daily_teams_insert/daily_teams_update (company-wide
-- manager or the project's own PM) — adding/removing a Foreman from
-- today's structure is a workforce-planning action, same authority level
-- as creating a team.
create policy daily_team_foreman_roster_insert
  on public.daily_team_foreman_roster
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and (public.has_any_company_role(company_id, array['company_admin', 'operations_manager']) or public.is_project_manager(project_id))
  );

create policy daily_team_foreman_roster_delete
  on public.daily_team_foreman_roster
  for delete
  to authenticated
  using (
    public.is_company_member(company_id)
    and (public.has_any_company_role(company_id, array['company_admin', 'operations_manager']) or public.is_project_manager(project_id))
  );

-- ============================================================================
-- Locked-team freeze now also covers foreman_employee_id — a locked
-- team's responsible Foreman is historical evidence too, same as its
-- name/shift/work_area/activity.
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
      or new.activity is distinct from old.activity
      or new.foreman_employee_id is distinct from old.foreman_employee_id then
      raise exception 'a locked daily team is frozen — unlock it first (unlock_daily_team()) to make a corrected, audited change';
    end if;
  end if;

  return new;
end;
$$;

-- ============================================================================
-- Insert-time defense in depth: a foreman_employee_id, if supplied, must
-- be a genuinely eligible Foreman for this project — mirrors every RPC's
-- own check, so a direct insert can never bypass it.
-- ============================================================================
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

  if new.foreman_employee_id is not null and not public.is_eligible_scaffold_foreman(new.foreman_employee_id, new.company_id, new.project_id) then
    raise exception 'the selected employee does not hold the foreman role on this project';
  end if;

  return new;
end;
$$;

-- ============================================================================
-- add_daily_team_foreman() / remove_daily_team_foreman() — item 4: adding
-- a Foreman to today's roster does NOT by itself create a team.
-- ============================================================================
create or replace function public.add_daily_team_foreman(target_project_id uuid, target_work_date date, target_foreman_employee_id uuid)
returns public.daily_team_foreman_roster
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_attendance_status public.daily_attendance_status;
  v_row public.daily_team_foreman_roster;
begin
  select company_id into v_company_id from public.projects where id = target_project_id;
  if v_company_id is null then
    raise exception 'project % not found', target_project_id;
  end if;

  if not public.is_eligible_scaffold_foreman(target_foreman_employee_id, v_company_id, target_project_id) then
    raise exception 'the selected employee does not hold the foreman role on this project';
  end if;

  select status into v_attendance_status
  from public.daily_attendance
  where project_id = target_project_id and employee_id = target_foreman_employee_id and work_date = target_work_date;
  if v_attendance_status is not null and not public.daily_attendance_permits_work(v_attendance_status) then
    raise exception 'this employee is marked % on % and cannot be added to today''s Foreman roster', v_attendance_status, target_work_date;
  end if;

  if exists (
    select 1 from public.daily_team_foreman_roster
    where project_id = target_project_id and work_date = target_work_date and foreman_employee_id = target_foreman_employee_id
  ) then
    raise exception 'this foreman has already been added to today''s teams';
  end if;

  insert into public.daily_team_foreman_roster (company_id, project_id, work_date, foreman_employee_id, created_by)
  values (v_company_id, target_project_id, target_work_date, target_foreman_employee_id, auth.uid())
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.add_daily_team_foreman(uuid, date, uuid) is
  'Item 4: adds an eligible, available Foreman to a project''s Today''s Teams structure for one date — this alone creates no team (a Foreman may exist here with zero teams). Rejects a duplicate add and an ineligible/unavailable employee.';

revoke all on function public.add_daily_team_foreman(uuid, date, uuid) from public, anon;
grant execute on function public.add_daily_team_foreman(uuid, date, uuid) to authenticated;

create or replace function public.remove_daily_team_foreman(target_project_id uuid, target_work_date date, target_foreman_employee_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.daily_teams
    where project_id = target_project_id and work_date = target_work_date and foreman_employee_id = target_foreman_employee_id
  ) then
    raise exception 'this foreman still has one or more teams today — reassign or remove those teams first';
  end if;

  delete from public.daily_team_foreman_roster
  where project_id = target_project_id and work_date = target_work_date and foreman_employee_id = target_foreman_employee_id;
end;
$$;

comment on function public.remove_daily_team_foreman(uuid, date, uuid) is
  'The inverse of add_daily_team_foreman() — refuses while the Foreman still has any team today, so a team is never left without its one responsible Foreman.';

revoke all on function public.remove_daily_team_foreman(uuid, date, uuid) from public, anon;
grant execute on function public.remove_daily_team_foreman(uuid, date, uuid) to authenticated;

-- ============================================================================
-- create_daily_team_for_foreman() — item 5: creating a team under an
-- already-known Foreman (no re-selection). Requires the Foreman already
-- be on today's roster (added via add_daily_team_foreman() first) — the
-- UI only ever offers this button inside an existing Foreman section.
-- ============================================================================
create or replace function public.create_daily_team_for_foreman(
  target_project_id uuid,
  target_work_date date,
  target_foreman_employee_id uuid,
  target_name text,
  target_shift public.lmra_shift,
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

  if not exists (
    select 1 from public.daily_team_foreman_roster
    where project_id = target_project_id and work_date = target_work_date and foreman_employee_id = target_foreman_employee_id
  ) then
    raise exception 'this foreman has not been added to today''s teams yet';
  end if;

  select coalesce(max(display_order), -1) + 1 into v_next_order
  from public.daily_teams
  where project_id = target_project_id and work_date = target_work_date;

  insert into public.daily_teams (company_id, project_id, work_date, name, shift, foreman_employee_id, work_area, activity, display_order, created_by, updated_by)
  values (v_company_id, target_project_id, target_work_date, target_name, target_shift, target_foreman_employee_id, target_work_area, target_activity, v_next_order, auth.uid(), auth.uid())
  returning * into v_team;

  return v_team;
end;
$$;

comment on function public.create_daily_team_for_foreman(uuid, date, uuid, text, public.lmra_shift, text, text) is
  'Item 5: creates a NEW Today''s Team directly under an already-known, already-rostered Foreman — no Foreman re-selection in this flow. Unlike the old create_daily_team_with_foreman(), never touches daily_team_members (foreman is the direct column) so it never collides with another team the same Foreman already runs.';

revoke all on function public.create_daily_team_for_foreman(uuid, date, uuid, text, public.lmra_shift, text, text) from public, anon;
grant execute on function public.create_daily_team_for_foreman(uuid, date, uuid, text, public.lmra_shift, text, text) to authenticated;

-- ============================================================================
-- update_daily_team_with_foreman() — rewritten: foreman change is now a
-- direct column update (no daily_team_members involvement, no "one team
-- per shift" constraint on the Foreman). A non-null
-- target_foreman_employee_id is auto-added to today's roster if not
-- already present (so "Change Foreman" never requires a separate "Add
-- Foreman" step first). The shift-conflict check now only ever concerns
-- WORKERS (daily_team_members), since Foremen no longer live there.
-- ============================================================================
create or replace function public.update_daily_team_with_foreman(
  target_daily_team_id uuid,
  target_project_id uuid,
  target_work_date date,
  target_name text,
  target_shift public.lmra_shift,
  target_foreman_employee_id uuid default null,
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
  v_old_shift public.lmra_shift;
  v_foreman_employee_id uuid;
  v_member record;
  v_resync record;
  v_conflict_team_name text;
  v_conflict_employee_name text;
  v_shift_label text;
  v_team public.daily_teams;
begin
  if target_daily_team_id is null then
    raise exception 'a daily team id is required';
  end if;
  if target_name is null or btrim(target_name) = '' then
    raise exception 'a team name is required';
  end if;
  if target_shift is null then
    raise exception 'a shift is required';
  end if;

  select company_id, shift, foreman_employee_id into v_company_id, v_old_shift, v_foreman_employee_id
  from public.daily_teams
  where id = target_daily_team_id and project_id = target_project_id and work_date = target_work_date;

  if v_company_id is null then
    raise exception 'daily team % not found on % for project %', target_daily_team_id, target_work_date, target_project_id;
  end if;

  if target_foreman_employee_id is not null then
    if not public.is_eligible_scaffold_foreman(target_foreman_employee_id, v_company_id, target_project_id) then
      raise exception 'the selected employee does not hold the foreman role on this project';
    end if;
    v_foreman_employee_id := target_foreman_employee_id;

    insert into public.daily_team_foreman_roster (company_id, project_id, work_date, foreman_employee_id, created_by)
    values (v_company_id, target_project_id, target_work_date, target_foreman_employee_id, auth.uid())
    on conflict (project_id, work_date, foreman_employee_id) do nothing;
  end if;

  if target_shift is distinct from v_old_shift then
    v_shift_label := case target_shift when 'day' then 'Day Shift' when 'night' then 'Night Shift' when 'late' then 'Late Shift' end;

    for v_member in
      select dtm.employee_id
      from public.daily_team_members dtm
      where dtm.daily_team_id = target_daily_team_id and dtm.removed_at is null
    loop
      select dt2.name into v_conflict_team_name
      from public.daily_team_members dtm2
      join public.daily_teams dt2 on dt2.id = dtm2.daily_team_id
      where dtm2.project_id = target_project_id
        and dtm2.work_date = target_work_date
        and dtm2.employee_id = v_member.employee_id
        and dtm2.removed_at is null
        and dtm2.daily_team_id <> target_daily_team_id
        and public.lmra_shift_sort_key(dtm2.shift) = public.lmra_shift_sort_key(target_shift)
      limit 1;

      if v_conflict_team_name is not null then
        select first_name || ' ' || last_name into v_conflict_employee_name from public.employees where id = v_member.employee_id;
        raise exception '% is already assigned to % on %. Move/remove the conflicting worker before changing this team to %.',
          coalesce(v_conflict_employee_name, 'This employee'), v_conflict_team_name, v_shift_label, v_shift_label;
      end if;
    end loop;
  end if;

  update public.daily_teams
  set name = target_name, shift = target_shift, foreman_employee_id = v_foreman_employee_id, work_area = target_work_area, activity = target_activity, updated_by = auth.uid()
  where id = target_daily_team_id;

  if target_shift is distinct from v_old_shift then
    for v_resync in
      select id, employee_id, role
      from public.daily_team_members
      where daily_team_id = target_daily_team_id and removed_at is null
    loop
      update public.daily_team_members
      set removed_at = now(), removed_by = auth.uid()
      where id = v_resync.id;

      insert into public.daily_team_members (company_id, project_id, work_date, daily_team_id, employee_id, role, created_by)
      values (v_company_id, target_project_id, target_work_date, target_daily_team_id, v_resync.employee_id, v_resync.role, auth.uid());
    end loop;
  end if;

  select * into v_team from public.daily_teams where id = target_daily_team_id;
  return v_team;
end;
$$;

comment on function public.update_daily_team_with_foreman(uuid, uuid, date, text, public.lmra_shift, uuid, text, text) is
  'Item 1/6: the ONE atomic edit path for an EXISTING Today''s Team. Changing the Foreman is a direct column update (auto-adding the new Foreman to today''s roster if needed) — the new Foreman may already run any number of other teams; that is fully expected, not a conflict. The old Foreman is never touched as a "worker" — they simply stop being this one team''s foreman_employee_id.';

revoke all on function public.update_daily_team_with_foreman(uuid, uuid, date, text, public.lmra_shift, uuid, text, text) from public, anon;
grant execute on function public.update_daily_team_with_foreman(uuid, uuid, date, text, public.lmra_shift, uuid, text, text) to authenticated;

-- create_daily_team_with_foreman() is retired — it inserted the Foreman as
-- a daily_team_members row, which would incorrectly collide with
-- daily_team_members_one_open_per_slot the moment that Foreman already
-- runs another team in the same shift (exactly the bug this migration
-- fixes). create_daily_team_for_foreman() above is its replacement.
drop function if exists public.create_daily_team_with_foreman(uuid, date, text, public.lmra_shift, uuid, text, text);
