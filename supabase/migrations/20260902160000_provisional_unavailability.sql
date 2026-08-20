-- ============================================================================
-- Provisional unavailability while a leave/absence request is PENDING
-- (Part 11 of the operational UX package)
-- ============================================================================
-- Ground truth (confirmed by reading modules/daily-workforce/queries.ts
-- before writing this): a PENDING leave_requests/absence_reports row has
-- always had ZERO effect on daily_attendance or on Today's Team/scaffold
-- crew assignment eligibility — only an APPROVED leave / CONFIRMED absence
-- ever touches daily_attendance (via apply_leave_to_attendance()/
-- confirm_absence_report()). This migration does NOT change that: it adds
-- a SEPARATE, additive "provisionally unavailable" signal used only at
-- NEW-assignment time, never retroactively touching daily_attendance or
-- any already-locked historical team/crew record.
-- ============================================================================

create or replace function public.is_employee_provisionally_unavailable(target_employee_id uuid, target_work_date date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1 from public.leave_requests lr
      where lr.employee_id = target_employee_id
        and lr.status = 'pending'
        and target_work_date between lr.start_date and lr.end_date
    )
    or exists (
      select 1 from public.absence_reports ar
      where ar.employee_id = target_employee_id
        and ar.status = 'pending'
        and ar.work_date = target_work_date
    );
$$;

comment on function public.is_employee_provisionally_unavailable(uuid, date) is
  'Part 11 — true while the employee has a PENDING (not yet decided) leave request or absence report covering this date. Used only to block NEW Today''s Team/scaffold-crew assignment attempts for that date; never writes to daily_attendance and never touches an existing, already-created assignment. SECURITY DEFINER because the acting user (e.g. a Foreman assigning their own team) may have no RLS read access to another employee''s leave_requests/absence_reports row at all.';

revoke all on function public.is_employee_provisionally_unavailable(uuid, date) from public, anon;
grant execute on function public.is_employee_provisionally_unavailable(uuid, date) to authenticated;

-- ── daily_team_members — add the provisional-unavailability check ───────
-- Full body copied verbatim from 20260902150000's version (which itself
-- copied 20260820090000's), with ONE new check appended.
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

  if new.role = 'member' and not public.is_employee_assignable_as_worker(new.employee_id, new.company_id) then
    if not exists (select 1 from public.employees e where e.id = new.employee_id and e.profile_id = auth.uid()) then
      raise exception 'employee % holds only management roles and can only self-assign to a daily team, not be assigned by someone else', new.employee_id;
    end if;
  end if;

  if public.is_employee_provisionally_unavailable(new.employee_id, new.work_date) then
    raise exception 'employee % has a pending leave/absence request for % and cannot be newly assigned to a daily team for that date', new.employee_id, new.work_date;
  end if;

  return new;
end;
$$;

comment on function public.validate_daily_team_member_insert() is
  'Phase A/B item 7 + Part 9''s management self-participation rule + Part 11''s provisional-unavailability check (20260902160000): a new assignment is rejected outright while the employee has a PENDING leave/absence request for that date — approved/confirmed already blocks via daily_attendance above; this catches the PENDING window that daily_attendance never touches.';

-- ── scaffold_erection_participants — same check ──────────────────────────
create or replace function public.validate_scaffold_erection_participant_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_project_id uuid;
  v_erected_at date;
begin
  select company_id, project_id, erected_at into v_company_id, v_project_id, v_erected_at from public.scaffolds where id = new.scaffold_id;
  if v_company_id is null then
    raise exception 'scaffold % not found', new.scaffold_id;
  end if;

  new.company_id := v_company_id;
  new.project_id := v_project_id;
  if new.work_date is null then
    new.work_date := v_erected_at;
  end if;

  perform public.assert_employee_eligible_for_assignment(new.employee_id);

  if new.source_daily_team_id is not null then
    if not exists (select 1 from public.daily_teams dt where dt.id = new.source_daily_team_id and dt.project_id = v_project_id) then
      raise exception 'source_daily_team_id must reference a Today''s Team on the same project';
    end if;
  end if;

  if not public.is_employee_assignable_as_worker(new.employee_id, v_company_id) then
    if not exists (select 1 from public.employees e where e.id = new.employee_id and e.profile_id = auth.uid()) then
      raise exception 'employee % holds only management roles and can only self-add to a scaffold erection crew, not be added by someone else', new.employee_id;
    end if;
  end if;

  if public.is_employee_provisionally_unavailable(new.employee_id, new.work_date) then
    raise exception 'employee % has a pending leave/absence request for % and cannot be newly added to a scaffold erection crew for that date', new.employee_id, new.work_date;
  end if;

  return new;
end;
$$;

comment on function public.validate_scaffold_erection_participant_insert() is
  'Derives company_id/project_id from the scaffold, defaults work_date, requires a real eligible employee, blocks management-only assignment by someone else (Part 9), and blocks assignment while a PENDING leave/absence request covers this date (Part 11, 20260902160000).';
