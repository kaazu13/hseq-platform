-- Operational audit finding (data-integrity gap, RPC-only enforcement):
-- 20260820091000_absent_zeroes_worked_hours.sql taught
-- upsert_worked_hours_categories() (and bulk_apply_worked_hours()) to
-- reject entering nonzero worked hours for an employee whose
-- daily_attendance status for that exact (project, work_date) does not
-- permit work (absent/sick/leave/training/off_site — see
-- daily_attendance_permits_work()). That check lives entirely in the
-- RPCs; worked_hours_breakdown itself has no trigger enforcing it at
-- all, and its own RLS (worked_hours_breakdown_insert/_update) grants
-- company_admin/operations_manager/the project's own PM ordinary
-- INSERT/UPDATE access. A manage-tier user can therefore INSERT/UPDATE
-- worked_hours_breakdown directly via PostgREST with nonzero hours for
-- an employee marked absent that same day, completely bypassing the
-- RPC's own check (and desyncing worked_hours.hours right along with it,
-- via sync_worked_hours_total()'s existing trigger). Live-confirmed: with
-- an employee marked 'absent' for a given (project, work_date),
-- upsert_worked_hours_categories() correctly rejected a nonzero entry
-- (HTTP 400), but a direct PATCH of the existing worked_hours_breakdown
-- row to 8.0 hours for the same employee/date succeeded (HTTP 200) and
-- the parent worked_hours.hours total synced to 8.0 right along with it.
--
-- Fix: a BEFORE INSERT OR UPDATE trigger on worked_hours_breakdown itself
-- — the real defense-in-depth backstop every write path should ultimately
-- go through, mirroring sync_worked_hours_total()'s own "regardless of
-- write path (RPC or, if ever reached, a raw authenticated table write)"
-- framing for the <=24h cap. A zero-value entry is still allowed through
-- (a no-op / explicit re-zero), exactly like the RPC's own rule, so this
-- can never deadlock against set_daily_attendance_status()'s own zeroing
-- pass (which sets hours = 0, always permitted).
create or replace function public.validate_worked_hours_breakdown_write()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_employee_id uuid;
  v_work_date date;
  v_attendance_status public.daily_attendance_status;
begin
  if new.hours = 0 then
    return new;
  end if;

  select employee_id, work_date into v_employee_id, v_work_date
  from public.worked_hours
  where id = new.worked_hours_id;

  select status into v_attendance_status
  from public.daily_attendance
  where project_id = new.project_id and employee_id = v_employee_id and work_date = v_work_date;

  if v_attendance_status is not null and not public.daily_attendance_permits_work(v_attendance_status) then
    raise exception 'cannot enter worked hours — this employee is marked % for %', v_attendance_status, v_work_date;
  end if;

  return new;
end;
$$;

comment on function public.validate_worked_hours_breakdown_write() is
  'Defense-in-depth mirror of upsert_worked_hours_categories()''s own attendance-permits-work check (20260820091000) — enforced here so a raw INSERT/UPDATE on worked_hours_breakdown (bypassing the RPC entirely) cannot record nonzero hours for an employee whose attendance status for that exact date does not permit work. A hours=0 write is always allowed (matches set_daily_attendance_status()''s own zeroing pass and the RPC''s own "still allow a no-op re-zero" rule).';

create trigger worked_hours_breakdown_validate_write
  before insert or update on public.worked_hours_breakdown
  for each row execute function public.validate_worked_hours_breakdown_write();
