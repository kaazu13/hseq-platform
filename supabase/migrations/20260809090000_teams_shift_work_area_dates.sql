-- Extends teams with the operational fields the promoted, project-scoped
-- Teams module needs to display alongside name/foreman/workers: shift,
-- work area, and an active date range. Foreman/workers stay resolved
-- relationally via team_assignments (unchanged) — these are genuinely new
-- descriptive columns on the team itself, not a duplication of anything
-- already modeled.
alter table public.teams
  add column shift text,
  add column work_area text,
  add column active_from date,
  add column active_until date,
  add constraint teams_active_range_check check (active_until is null or active_from is null or active_until >= active_from);

comment on column public.teams.shift is 'Free-text shift label (e.g. "Day", "Night", "Weekend") — no fixed vocabulary, mirrors work_area''s free-text convention elsewhere in this schema.';
comment on column public.teams.work_area is 'Free-text work area/zone this crew is currently assigned to — same convention as scaffolds.work_area.';
comment on column public.teams.active_from is 'Date this team becomes active on the project. Nullable — a team without a recorded start is still valid, same as other optional date fields in this schema.';
comment on column public.teams.active_until is 'Date this team stops being active on the project. Nullable — most teams have no planned end date.';

-- save_team_with_assignments() gains the four new fields as trailing,
-- defaulted parameters. A defaulted-parameter signature change is a
-- DIFFERENT overload as far as Postgres's function resolution is
-- concerned — CREATE OR REPLACE alone would leave the old 8-parameter
-- version in place alongside this new 12-parameter one, and Postgres's
-- overload resolution prefers the candidate using FEWER defaults, so
-- every existing 8-argument call site would keep silently hitting the OLD
-- function forever. The explicit DROP below is what actually retires it.
drop function if exists public.save_team_with_assignments(uuid, uuid, text, text, public.team_color, text, public.team_status, jsonb);

create or replace function public.save_team_with_assignments(
  target_team_id uuid,
  target_project_id uuid,
  target_name text,
  target_code text,
  target_color public.team_color,
  target_description text,
  target_status public.team_status,
  target_assignments jsonb default '[]'::jsonb,
  target_shift text default null,
  target_work_area text default null,
  target_active_from date default null,
  target_active_until date default null
)
returns public.teams
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_next_order integer;
  v_team public.teams;
  v_change record;
  v_final_open_count integer;
begin
  select company_id into v_company_id from public.projects where id = target_project_id;
  if v_company_id is null then
    raise exception 'project % not found', target_project_id;
  end if;

  if target_status = 'archived' then
    select count(*) into v_final_open_count
    from (
      select ta.employee_id
      from public.team_assignments ta
      where ta.team_id = target_team_id
        and ta.end_at is null
        and not exists (
          select 1 from jsonb_array_elements(target_assignments) elem
          where (elem ->> 'employee_id')::uuid = ta.employee_id
        )
      union
      select (elem ->> 'employee_id')::uuid
      from jsonb_array_elements(target_assignments) elem
      where elem ->> 'role' <> 'none'
    ) as final_members;

    if v_final_open_count > 0 then
      raise exception 'A team cannot be archived while it has assigned employees. Remove all current assignments first.';
    end if;
  end if;

  if target_team_id is null then
    select coalesce(max(display_order), -1) + 1 into v_next_order
    from public.teams
    where project_id = target_project_id;

    insert into public.teams (
      company_id, project_id, name, code, color, description, status, shift, work_area, active_from, active_until, display_order, created_by, updated_by
    )
    values (
      v_company_id, target_project_id, target_name, target_code, target_color, target_description, target_status, target_shift, target_work_area, target_active_from, target_active_until, v_next_order, auth.uid(), auth.uid()
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
    for v_change in select * from jsonb_to_recordset(target_assignments) as x(employee_id uuid, role text)
    loop
      if v_change.role = 'none' then
        perform public.end_team_assignment(target_project_id, v_change.employee_id);
      else
        perform public.move_employee_to_team(target_project_id, target_team_id, v_change.employee_id, v_change.role::public.team_assignment_role);
      end if;
    end loop;

    update public.teams
    set name = target_name, code = target_code, color = target_color, description = target_description, status = target_status,
        shift = target_shift, work_area = target_work_area, active_from = target_active_from, active_until = target_active_until,
        updated_by = auth.uid()
    where id = target_team_id and project_id = target_project_id
    returning * into v_team;

    if v_team.id is null then
      raise exception 'team % not found in project %', target_team_id, target_project_id;
    end if;
  end if;

  return v_team;
end;
$$;

comment on function public.save_team_with_assignments(uuid, uuid, text, text, public.team_color, text, public.team_status, jsonb, text, text, date, date) is
  'Atomic create-or-update of a team plus every assignment change from the Team dialog, in one transaction — the Team dialog''s sole write path (modules/teams/actions.ts). target_team_id null = create. Rejects up front, before any write, a requested final state of archived with one or more employees still assigned. shift/work_area/active_from/active_until are plain descriptive fields with no further validation beyond the active_from/active_until ordering check on the table.';

revoke all on function public.save_team_with_assignments(uuid, uuid, text, text, public.team_color, text, public.team_status, jsonb, text, text, date, date) from public, anon;
grant execute on function public.save_team_with_assignments(uuid, uuid, text, text, public.team_color, text, public.team_status, jsonb, text, text, date, date) to authenticated;
