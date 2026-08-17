-- Task 3 Part 13 follow-up, found via live testing: the Edit Project page
-- 404s for a planner (getProject returns null) even after
-- update_project_site_location() was fixed to let them WRITE — because
-- projects_select's RLS never admitted planner at all (only company_admin/
-- operations_manager company-wide, or has_project_access(id) for an
-- explicit per-project assignment, which a planner configuring site
-- locations across projects may not have). This is the real, simple root
-- cause of that page-render gap — separate from the earlier UPDATE-policy
-- investigation (20260901116000), which was about writes, not reads.
alter policy projects_select
  on public.projects
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager', 'planner'])
      or public.has_project_access(id)
    )
  );

comment on policy projects_select on public.projects is
  'company_admin/operations_manager/planner (company-wide), or anyone with an explicit project_assignments/team_assignments row on this specific project, may read it. planner added (Task 3 Part 13) so they can actually see and manage site locations across the company''s projects, not only ones they happen to be individually assigned to.';
