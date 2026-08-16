-- Operational audit finding (live testing): calling set_daily_attendance_status()
-- to mark an employee unavailable, when their Today's Team for that date is
-- already locked, raised "this daily team is locked — its roster is
-- frozen" and rolled back the entire attendance change — so attendance
-- couldn't even be corrected after end-of-day lock. This exact scenario was
-- already fixed once, deliberately, in 20260815090000_daily_workforce_fixes.sql
-- ("caught in design review, before any UI shipped against it"): a locked
-- day's team roster must stay exactly as history recorded it, but that must
-- NOT block recording the true attendance status after the fact — the two
-- are separate facts. That fix scoped the team-removal UPDATE to `and
-- daily_team_id in (select id from daily_teams where status = 'open')`,
-- silently skipping a locked team's membership rather than touching (or
-- erroring on) it. 20260820091000_absent_zeroes_worked_hours.sql's `create
-- or replace function` rewrite (adding closed-day corrections and
-- worked-hours zeroing) dropped that filter without noticing, silently
-- reintroducing the original bug — tests/db/daily-workforce-invariants.test.ts's
-- existing "correcting attendance after a day is locked still works" test
-- (written against the correct, pre-regression behavior) would have caught
-- this had test:db been runnable in this environment.
--
-- This migration: (a) restores the open-teams-only filter, so a locked
-- team's roster is silently left untouched exactly as originally designed
-- — no exception, no unlock required; (b) makes the id-capture multi-row-safe
-- via a CTE — independently necessary, since an employee can legitimately
-- hold two open rows on the same date across different shifts
-- (daily_team_members_one_open_per_slot is scoped by shift), and a bare
-- `returning ... into` on a multi-row UPDATE crashes regardless of the
-- lock-scoping fix.
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
  v_worked_hours public.worked_hours;
  v_category record;
  v_any_hours_correction boolean := false;
  v_new_total numeric;
  v_recipient_user_id uuid;
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
    -- Only an OPEN team's membership can be closed here — a locked team's
    -- roster is frozen historical evidence and is left alone (restored
    -- from 20260815090000_daily_workforce_fixes.sql). An employee may hold
    -- more than one open row today (different shifts), so this is
    -- multi-row-safe: capture one id via the CTE for the existing
    -- single-uuid return column, but the UPDATE itself still closes every
    -- matching open-team row, not just one.
    with removed as (
      update public.daily_team_members
      set removed_at = now(), removed_by = auth.uid()
      where project_id = target_project_id
        and employee_id = target_employee_id
        and work_date = target_work_date
        and removed_at is null
        and daily_team_id in (select id from public.daily_teams where status = 'open')
      returning daily_team_id
    )
    select daily_team_id into v_removed_team_id from removed limit 1;

    select * into v_worked_hours
    from public.worked_hours
    where project_id = target_project_id and employee_id = target_employee_id and work_date = target_work_date
    for update;

    if v_worked_hours.id is not null then
      for v_category in
        select category, hours from public.worked_hours_breakdown where worked_hours_id = v_worked_hours.id and hours <> 0
      loop
        if v_worked_hours.status = 'submitted' then
          if target_reason is null or btrim(target_reason) = '' then
            raise exception 'a reason is required — marking this employee % will zero out % already-submitted worked hours', target_status, v_category.hours;
          end if;
          insert into public.worked_hours_corrections (company_id, worked_hours_id, project_id, employee_id, category, previous_hours, new_hours, reason, changed_by)
          values (v_company_id, v_worked_hours.id, target_project_id, target_employee_id, v_category.category, v_category.hours, 0, target_reason, auth.uid());
          v_any_hours_correction := true;
        end if;

        update public.worked_hours_breakdown
        set hours = 0, updated_by = auth.uid(), updated_at = now()
        where worked_hours_id = v_worked_hours.id and category = v_category.category;
      end loop;

      if v_any_hours_correction then
        select coalesce(sum(hours), 0) into v_new_total from public.worked_hours_breakdown where worked_hours_id = v_worked_hours.id;
        select e.profile_id into v_recipient_user_id from public.employees e where e.id = target_employee_id;
        if v_recipient_user_id is not null then
          insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
          values (
            v_company_id,
            v_recipient_user_id,
            'worked_hours_corrected',
            'Worked hours reset to 0.0h',
            format('%s: marked %s. Reason: %s', to_char(target_work_date, 'DD Mon YYYY'), target_status, target_reason),
            '/my-hours'
          );
        end if;
      end if;
    end if;
  end if;

  return query select v_attendance, v_removed_team_id;
end;
$$;

comment on function public.set_daily_attendance_status(uuid, uuid, date, public.daily_attendance_status, text, text) is
  'The sole write path for daily_attendance status. Free edit on an OPEN day; a reason is required and audited (daily_attendance_corrections) on a CLOSED one. Transitioning to a status that does not permit work ALSO atomically removes any OPEN-team daily_team_members row(s) for that (project, employee, work_date) — a locked team''s roster is left untouched, exactly as originally designed in 20260815090000_daily_workforce_fixes.sql — AND zeroes every nonzero worked_hours_breakdown category, silently if the hours were still draft, with a required reason + worked_hours_corrections audit row + employee notification if they were already submitted. Changing back to a work-permitting status never restores the old values (they were genuinely zeroed, not hidden) — a PM must deliberately re-enter hours. RLS on every touched table is the real gate.';

revoke all on function public.set_daily_attendance_status(uuid, uuid, date, public.daily_attendance_status, text, text) from public, anon;
grant execute on function public.set_daily_attendance_status(uuid, uuid, date, public.daily_attendance_status, text, text) to authenticated;
