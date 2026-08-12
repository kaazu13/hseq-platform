-- 20260819092000's redefinition of set_daily_attendance_status() changed
-- its return type from the ORIGINAL `table (attendance public.daily_attendance,
-- removed_from_team_id uuid)` (20260812090000) to a plain `public.daily_attendance`
-- row — an undetected breaking change to modules/daily-workforce/actions.ts's
-- existing setDailyAttendanceStatus(), which reads `data.attendance` and
-- `data.removed_from_team_id` from every call. Caught by re-reading the
-- original migration before touching any TypeScript. Restores the exact
-- original composite return shape and upsert pattern, with the Phase 5
-- closed-day/reason/correction logic layered on top rather than replacing
-- it.
--
-- Postgres refuses `create or replace` across a return-type change even
-- with an identical parameter list ("cannot change return type of existing
-- function") — the 6-arg overload must be dropped first.
drop function if exists public.set_daily_attendance_status(uuid, uuid, date, public.daily_attendance_status, text, text);

create or replace function public.set_daily_attendance_status(
  target_project_id uuid,
  target_employee_id uuid,
  target_work_date date,
  target_status public.daily_attendance_status,
  target_note text default null,
  target_reason text default null
)
returns table (attendance public.daily_attendance, removed_from_team_id uuid)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_existing public.daily_attendance;
  v_attendance public.daily_attendance;
  v_removed_team_id uuid;
  v_is_closed boolean;
begin
  select company_id into v_company_id from public.projects where id = target_project_id;
  if v_company_id is null then
    raise exception 'project % not found', target_project_id;
  end if;

  select exists (
    select 1 from public.daily_attendance_day_locks
    where project_id = target_project_id and work_date = target_work_date and unlocked_at is null
  ) into v_is_closed;

  select * into v_existing
  from public.daily_attendance
  where project_id = target_project_id and employee_id = target_employee_id and work_date = target_work_date
  for update;

  if v_is_closed then
    if v_existing.id is null then
      raise exception 'this absence day is closed — reopen it first to add a new attendance record';
    end if;
    if v_existing.status is distinct from target_status then
      if target_reason is null or btrim(target_reason) = '' then
        raise exception 'a reason is required to correct attendance on a closed absence day';
      end if;
      insert into public.daily_attendance_corrections (company_id, project_id, employee_id, work_date, previous_status, new_status, reason, changed_by)
      values (v_company_id, target_project_id, target_employee_id, target_work_date, v_existing.status, target_status, target_reason, auth.uid());
    end if;
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

comment on function public.set_daily_attendance_status(uuid, uuid, date, public.daily_attendance_status, text, text) is
  'The sole write path for daily_attendance status (Phases B/C, extended in Phase 5 for closed-day corrections). Free edit on an OPEN day; a reason is required and audited (daily_attendance_corrections) on a CLOSED one. Also atomically removes any open Today''s Team membership when the new status blocks work. Returns the ORIGINAL (attendance, removed_from_team_id) composite shape — modules/daily-workforce/actions.ts depends on it. RLS on daily_attendance/daily_team_members is the real gate.';

revoke all on function public.set_daily_attendance_status(uuid, uuid, date, public.daily_attendance_status, text, text) from public, anon;
grant execute on function public.set_daily_attendance_status(uuid, uuid, date, public.daily_attendance_status, text, text) to authenticated;
