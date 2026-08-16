-- ============================================================================
-- Employee-role correction milestone: reverses one specific, deliberate
-- prior decision (20260802120000_safety_observations_and_corrective_actions.sql,
-- footnote 12 — "safety reporting should never be gated behind a manager
-- role") per this task's explicit new product direction: an ordinary
-- Employee should no longer be able to CREATE a Safety Observation —
-- Employee's role here is now purely "see observations that are about
-- me," not "author observations about others."
--
-- UPDATE (own-edit) is deliberately left untouched — an employee can
-- never author a NEW observation after this migration, so they can never
-- again produce an "own entry" to edit either; this is a narrower, single-
-- point fix (creation only) rather than a wider rewrite of the edit
-- policy, matching this milestone's own "Employee correction only, do not
-- redesign for other roles" scope. Every other role's create rights
-- (hse_officer, foreman, inspector, hseq_manager) are completely
-- unchanged.
-- ============================================================================
drop policy if exists safety_observations_insert on public.safety_observations;
create policy safety_observations_insert
  on public.safety_observations
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and (
      public.has_company_role(company_id, 'hseq_manager')
      or (
        public.has_any_company_role(company_id, array['hse_officer', 'foreman', 'inspector'])
        and public.has_project_access(project_id)
      )
    )
  );

comment on policy safety_observations_insert on public.safety_observations is
  'hseq_manager (company-wide), or hse_officer/foreman/inspector with project access. `employee` removed (Employee-role correction milestone) — an ordinary worker no longer creates observations, only sees ones targeted at them; every other role''s create rights are unchanged.';
