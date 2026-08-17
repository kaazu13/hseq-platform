-- Task 3 Part 3 fixture-seeding aside, found via live testing: confirming a
-- pending self-reported absence (confirm_absence_report()) applies the
-- resulting status via set_daily_attendance_status(), whose 6th parameter
-- (target_reason) is required whenever the employee already has SUBMITTED
-- worked hours for that date (20260820091000_absent_zeroes_worked_hours.sql
-- — the same "zero out already-submitted worked hours needs a reason" rule
-- modules/absences/components/mark-absent-dialog.tsx's "Mark Absent" flow
-- already handles correctly, via correctAbsenceStatus). But
-- confirm_absence_report(target_report_id uuid) took only ONE argument —
-- there was no way for a caller to ever supply that reason, so confirming
-- any absence report for a date with already-submitted worked hours failed
-- unconditionally with no recovery path. Live-confirmed via the fixture
-- seed script.
--
-- Fix: add an optional target_reason parameter (default null — fully
-- backward compatible, every existing call site with no conflict is
-- unaffected), threaded straight through to set_daily_attendance_status's
-- own target_reason. Mirrors correctAbsenceStatus's existing "retry in
-- place with the reason field revealed" app-layer pattern.
create or replace function public.confirm_absence_report(target_report_id uuid, target_reason text default null)
returns public.absence_reports
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_report public.absence_reports;
  v_result public.absence_reports;
  v_status public.daily_attendance_status;
begin
  select * into v_report from public.absence_reports where id = target_report_id and status = 'pending';
  if v_report.id is null then
    raise exception 'open absence report % not found', target_report_id;
  end if;

  v_status := case v_report.reason when 'sick' then 'sick'::public.daily_attendance_status else 'absent'::public.daily_attendance_status end;
  perform public.set_daily_attendance_status(v_report.project_id, v_report.employee_id, v_report.work_date, v_status, v_report.comment, target_reason);

  update public.absence_reports
  set status = 'confirmed', reviewed_by = auth.uid(), reviewed_at = now()
  where id = target_report_id
  returning * into v_result;

  insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
  select v_result.company_id, e.profile_id, 'absence_report_confirmed', 'Absence approved',
    format('You are marked %s for %s.', v_status, to_char(v_result.work_date, 'DD Mon YYYY')),
    '/dashboard'
  from public.employees e where e.id = v_result.employee_id and e.profile_id is not null;

  return v_result;
end;
$$;

comment on function public.confirm_absence_report(uuid, text) is
  'Manager confirms a self-reported absence — applies the resulting daily_attendance status and notifies the reporting employee. target_reason is optional and only actually required (enforced by set_daily_attendance_status) when the employee already has submitted worked hours for that date that this will zero out — same "retry in place with the reason field revealed" pattern as correctAbsenceStatus/Mark Absent. Caller is always manage-tier (RLS-checked elsewhere).';

drop function if exists public.confirm_absence_report(uuid);

revoke all on function public.confirm_absence_report(uuid, text) from public, anon;
grant execute on function public.confirm_absence_report(uuid, text) to authenticated;
