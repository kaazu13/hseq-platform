-- ============================================================================
-- Management self-participation rule (Part 9 of the operational UX
-- package): platform_super_admin/company_admin/project_manager/planner
-- must never be assignable as an ORDINARY worker (Today's Team member,
-- scaffold erection crew) by someone ELSE — only by themselves, when they
-- deliberately choose to perform the work personally. A multi-role
-- account that ALSO genuinely holds an operational role (foreman,
-- inspector, employee, hse_officer, hseq_manager, operations_manager,
-- recruiter) is unaffected — the rule only bites when EVERY role the
-- target holds is management-only.
-- ============================================================================
-- Enforced server-side (this migration), not just hidden in the UI — a
-- crafted client request naming a management-only employee_id must be
-- rejected the same way a crafted request naming an ineligible inspector
-- already is (assert_valid_inspection_inspector, same session's earlier
-- work).
-- ============================================================================

create or replace function public.is_employee_assignable_as_worker(target_employee_id uuid, target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    -- No active company role at all: not blocked by THIS rule (other
    -- eligibility checks, e.g. assert_employee_eligible_for_assignment,
    -- already cover "not a real, active, same-company person").
    not exists (
      select 1
      from public.employees e
      join public.company_memberships m on m.user_id = e.profile_id and m.company_id = target_company_id and m.status = 'active'
      join public.membership_roles mr on mr.membership_id = m.id
      where e.id = target_employee_id
    )
    or exists (
      -- Holds at least one role OUTSIDE the management-only set — a
      -- legitimate multi-role account (e.g. project_manager + foreman).
      select 1
      from public.employees e
      join public.company_memberships m on m.user_id = e.profile_id and m.company_id = target_company_id and m.status = 'active'
      join public.membership_roles mr on mr.membership_id = m.id
      join public.roles r on r.id = mr.role_id
      where e.id = target_employee_id
        and r.name not in ('platform_super_admin', 'company_admin', 'project_manager', 'planner')
    );
$$;

comment on function public.is_employee_assignable_as_worker(uuid, uuid) is
  'Part 9 — false only when EVERY company role the target employee holds is management-only (platform_super_admin/company_admin/project_manager/planner). Used to block OTHER people from assigning a management-only account as an ordinary Today''s Team member or scaffold erection participant — the account may still self-add (checked separately at each call site via employees.profile_id = auth.uid()).';

revoke all on function public.is_employee_assignable_as_worker(uuid, uuid) from public, anon;
grant execute on function public.is_employee_assignable_as_worker(uuid, uuid) to authenticated;

-- ── daily_team_members ──────────────────────────────────────────────────
-- Full body copied verbatim from 20260820090000's version, with ONE new
-- check added for 'member'-role inserts (the 'foreman' branch already has
-- its own, stricter is_eligible_scaffold_foreman() check and is untouched).
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

  return new;
end;
$$;

comment on function public.validate_daily_team_member_insert() is
  'Phase A/B + this milestone''s item 7, plus Part 9''s management self-participation rule (20260902150000): a ''member''-role insert for an employee who holds ONLY management-only roles is rejected unless the acting user IS that employee (self-add). A "member"-role insert for anyone else is unaffected. Combined with daily_team_members_one_open_per_slot above, this also means a foreman cannot end up heading two teams in the same (project, work_date, shift) slot.';

-- ── scaffold_erection_participants ──────────────────────────────────────
-- Full body copied verbatim from 20260901125000's version, with the same
-- new check added.
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

  return new;
end;
$$;

comment on function public.validate_scaffold_erection_participant_insert() is
  'Derives company_id/project_id from the scaffold (never client-trusted), defaults work_date to the scaffold''s own erected_at when not explicitly supplied, requires the employee to be a real, non-archived, same-company person, and (Part 9, 20260902150000) blocks assigning a management-only employee to the crew unless the acting user IS that employee.';
