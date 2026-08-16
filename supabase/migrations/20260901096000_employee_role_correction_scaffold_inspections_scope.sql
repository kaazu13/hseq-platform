-- ============================================================================
-- Employee-role correction milestone: scaffold_inspections_select
-- (20260803120000_scaffold_inspections.sql) predates the Scaffold
-- Register V2 employee-exclusion work (20260831093000_scaffold_register_v2.sql)
-- and was never updated to match it — it still admits ANY project member
-- via a bare has_project_access(project_id) check, with no role
-- consideration at all. That includes a plain `employee`, who can already
-- (per that same V2 migration) never see the Scaffold Register itself —
-- an inconsistent, unintended gap: an ordinary worker could view every
-- scaffold inspection on their project (including via direct URL to a
-- specific inspection, bypassing the app's own list-page guard) despite
-- being deliberately excluded from the register those inspections belong
-- to.
--
-- Scope: this fix is intentionally narrow — it excludes ONLY the plain
-- `employee` role from the existing has_project_access(...) branch,
-- leaving every other currently-passing role (project_manager, hse_officer,
-- foreman, inspector, and anyone with an assignment under any other role)
-- with EXACTLY their current access, unchanged. Broader realignment of
-- this policy to Scaffold Register's own narrower role allow-list is
-- explicitly out of scope for the Employee-only correction this migration
-- is part of.
-- ============================================================================
drop policy if exists scaffold_inspections_select on public.scaffold_inspections;
create policy scaffold_inspections_select
  on public.scaffold_inspections
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager', 'hseq_manager'])
      or (public.has_project_access(project_id) and not public.has_company_role(company_id, 'employee'))
    )
  );

comment on policy scaffold_inspections_select on public.scaffold_inspections is
  'Company-wide managers (company_admin/operations_manager/hseq_manager), or any other project member EXCEPT a plain employee (Employee-role correction milestone — Scaffold Inspections now matches Scaffold Register''s "employees never see this module" rule). Every other role''s access is unchanged from before this migration.';
