-- Fix (caught in design review, before any UI shipped against it): if an
-- employee's Today's Team for a date was already LOCKED, calling
-- set_daily_attendance_status() to mark them unavailable would raise an
-- exception (validate_daily_team_member_update() correctly refuses to
-- remove a member from a locked team) and roll back the ENTIRE status
-- update along with it — so attendance couldn't even be corrected
-- afterward. A locked day's team roster must stay exactly as history
-- recorded it ("do not silently modify locked records"), but that must
-- NOT block recording the true attendance status after the fact — the two
-- are separate facts. Fixed: the team-removal side effect now only
-- targets an OPEN team; a locked team's membership is left untouched
-- (the historical record stays frozen) while the attendance status itself
-- still updates normally.
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
      -- Only an OPEN team's membership can be closed here — a locked
      -- team's roster is frozen historical evidence and is left alone.
      and daily_team_id in (select id from public.daily_teams where status = 'open')
    returning daily_team_id into v_removed_team_id;
  end if;

  return query select v_attendance, v_removed_team_id;
end;
$$;

comment on function public.set_daily_attendance_status(uuid, uuid, date, public.daily_attendance_status, text) is
  'The sole write path for daily_attendance (modules/daily-workforce/actions.ts). Atomically upserts the status and, if the new status blocks working AND the employee''s current team for that date is still OPEN, removes that daily_team_members row — the database-side half of "mark unavailable removes today''s team assignment atomically." If the team is already LOCKED, its roster is left untouched (frozen historical evidence) while the attendance status still updates normally — a locked day must never silently gain a membership change, but correcting attendance after the fact must never be blocked by that.';
