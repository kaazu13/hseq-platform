-- ============================================================================
-- Inspector role correction (Part E) — daily workforce RLS
-- ============================================================================
-- Manual role testing found Inspector wrongly treated as a generic
-- workforce-management viewer: `daily_attendance_select`/`daily_teams_select`/
-- `daily_team_members_select` all named `inspector` alongside the genuine
-- broad-viewer roles (project_manager/hseq_manager/hse_officer/foreman),
-- granting Inspector read access to EVERY team's roster and EVERY
-- employee's daily attendance status project-wide. Inspector is an
-- operational scaffold-inspection role and must use the same PERSONAL
-- "my own team" model as a plain Employee (never broad workforce
-- visibility) unless another explicit management/broad-viewer role is
-- also held — this is a genuine over-broad DATABASE-level grant, not just
-- an app-layer nav/routing gap, so it's corrected at the RLS layer here
-- (matching modules/daily-workforce/permissions.ts's canViewDailyWorkforceBroadly()
-- change in the same commit — RLS is the real enforcement, the TS
-- function only mirrors it for rendering decisions).
-- ============================================================================

drop policy daily_attendance_select on public.daily_attendance;
create policy daily_attendance_select
  on public.daily_attendance
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or (public.has_project_access(project_id) and public.has_any_company_role(company_id, array['project_manager', 'hseq_manager', 'hse_officer', 'foreman']))
      or exists (select 1 from public.employees e where e.id = daily_attendance.employee_id and e.profile_id = auth.uid())
    )
  );

comment on policy daily_attendance_select on public.daily_attendance is
  'Inspector role correction: "inspector" removed from the broad-viewer role array — an Inspector now only ever sees their OWN daily_attendance row (the third branch, own-employee-record), same as a plain Employee, unless they also hold a genuine broad-viewer/manage role. Every other role''s access is unchanged.';

drop policy daily_teams_select on public.daily_teams;
create policy daily_teams_select
  on public.daily_teams
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or (public.has_project_access(project_id) and public.has_any_company_role(company_id, array['project_manager', 'hseq_manager', 'hse_officer', 'foreman']))
      or exists (
        select 1 from public.daily_team_members dtm
        join public.employees e on e.id = dtm.employee_id
        where dtm.daily_team_id = daily_teams.id and e.profile_id = auth.uid()
      )
    )
  );

comment on policy daily_teams_select on public.daily_teams is
  'Inspector role correction — see daily_attendance_select''s comment. An Inspector now only sees a team it is itself a member of (the own-membership branch), never every team in the project.';

drop policy daily_team_members_select on public.daily_team_members;
create policy daily_team_members_select
  on public.daily_team_members
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or (public.has_project_access(project_id) and public.has_any_company_role(company_id, array['project_manager', 'hseq_manager', 'hse_officer', 'foreman']))
      or exists (select 1 from public.employees e where e.id = daily_team_members.employee_id and e.profile_id = auth.uid())
    )
  );

comment on policy daily_team_members_select on public.daily_team_members is
  'Inspector role correction — see daily_attendance_select''s comment.';

-- ============================================================================
-- Workforce attendance correction (Part G) — platform_super_admin gap
-- ============================================================================
-- Every write policy in this domain (daily_attendance_insert/update) grants
-- company_admin/operations_manager (company-wide) or the project's own
-- assigned project_manager — platform_super_admin was never explicitly
-- OR'd in, unlike several other domains in this app (e.g.
-- is_scaffold_broad_creator() explicitly ORs in is_platform_super_admin()).
-- The task's own authorized-management matrix explicitly requires
-- "platform_super_admin: global" attendance-correction authority, so this
-- closes that gap consistently with the existing is_platform_super_admin()
-- pattern used elsewhere.
drop policy daily_attendance_insert on public.daily_attendance;
create policy daily_attendance_insert
  on public.daily_attendance
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
      or public.is_platform_super_admin()
    )
  );

drop policy daily_attendance_update on public.daily_attendance;
create policy daily_attendance_update
  on public.daily_attendance
  for update
  to authenticated
  using (public.is_company_member(company_id))
  with check (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
      or public.is_platform_super_admin()
    )
  );

comment on policy daily_attendance_insert on public.daily_attendance is
  'Workforce attendance correction (Part G): company_admin/operations_manager company-wide, the project''s own assigned project_manager, or platform_super_admin globally — matches the task''s explicit authorized-management matrix. Inspector/foreman/hse_officer/hseq_manager/recruiter/planner/employee are never authorized solely by role.';
comment on policy daily_attendance_update on public.daily_attendance is
  'See daily_attendance_insert''s comment — same authorized-management matrix.';

-- Same platform_super_admin gap in the Holiday/Leave approval RLS — the
-- Holiday/Leave workflow IS the same "authorized management matrix" per
-- Part G ("if holiday: respect approved leave behavior").
drop policy leave_requests_update on public.leave_requests;
create policy leave_requests_update
  on public.leave_requests
  for update
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
      or public.is_platform_super_admin()
      or exists (select 1 from public.employees e where e.id = leave_requests.employee_id and e.profile_id = auth.uid())
    )
  )
  with check (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
      or public.is_platform_super_admin()
      or exists (select 1 from public.employees e where e.id = leave_requests.employee_id and e.profile_id = auth.uid())
    )
  );

comment on policy leave_requests_update on public.leave_requests is
  'Part G: platform_super_admin added to the manage-tier branch (global authority), matching daily_attendance_insert/update''s identical fix in this migration. The requesting employee''s own resubmit/cancel branch is unchanged.';
