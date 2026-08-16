-- ============================================================================
-- Employee-role correction milestone: closes a real IDOR — lmra_assessments_select
-- (20260801090000_lmra.sql) currently grants ANY project member
-- (has_project_access(project_id), no role check at all) read access to
-- EVERY LMRA on that project. The application's own listMyLmraAssessments()
-- already narrows the LIST a plain employee sees to ones they're actually
-- involved in, but that is a UI-layer convenience only — RLS is this
-- codebase's real enforcement (see every other module's own comments to
-- the same effect) — so a plain employee hitting /lmra/[lmraId] directly
-- for an unrelated LMRA on their own project currently succeeds. Confirmed
-- live: app/(app)/lmra/[lmraId]/page.tsx has no additional involvement
-- check beyond whatever getLmraAssessment()/RLS returns.
--
-- Fix: a plain `employee` (no other role) now only passes via a new
-- involvement-based branch mirroring modules/lmra/queries.ts's
-- resolveMyLmraAssessmentIds() exactly (completed-by, assessment-level
-- responsible person, a hazard-level responsible person, or a listed
-- participant) PLUS one additional criterion the same task asked for:
-- membership on the assessment's linked historical daily_team_id, per the
-- actual saved daily_team_members relationship for that day (never a live/
-- current-day lookup — historical evidence must never silently change
-- meaning as team rosters move on).
--
-- Scope: identical narrowing discipline to this milestone's other RLS
-- fixes — ONLY plain-employee callers are newly restricted; every
-- currently-passing role (foreman, hseq_manager, company_admin,
-- operations_manager, project_manager, hse_officer, inspector, or anyone
-- else with project access) keeps EXACTLY its current broad access,
-- unchanged. The new involvement branch is additionally OR'd in for
-- everyone (harmless — it only ever WIDENS access for a caller who
-- otherwise wouldn't already pass, e.g. someone no longer on the project
-- but historically involved in one specific record), never narrows
-- anyone else.
-- ============================================================================
drop policy if exists lmra_assessments_select on public.lmra_assessments;
create policy lmra_assessments_select
  on public.lmra_assessments
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager', 'hseq_manager'])
      or (public.has_project_access(project_id) and not public.has_company_role(company_id, 'employee'))
      or exists (
        select 1 from public.employees e
        where e.company_id = lmra_assessments.company_id
          and e.profile_id = auth.uid()
          and (
            e.id = lmra_assessments.completed_by_employee_id
            or e.id = lmra_assessments.responsible_person_id
            or exists (select 1 from public.lmra_participants lp where lp.lmra_assessment_id = lmra_assessments.id and lp.employee_id = e.id)
            or exists (select 1 from public.lmra_hazards lh where lh.lmra_assessment_id = lmra_assessments.id and lh.responsible_person_id = e.id)
            or (
              lmra_assessments.daily_team_id is not null
              and exists (select 1 from public.daily_team_members dtm where dtm.daily_team_id = lmra_assessments.daily_team_id and dtm.employee_id = e.id)
            )
          )
      )
    )
  );

comment on policy lmra_assessments_select on public.lmra_assessments is
  'Company-wide managers, or any other project member EXCEPT a plain employee (unchanged from before this migration for every non-employee role). A plain employee instead needs genuine involvement: completed-by, assessment/hazard-level responsible person, a listed participant, or membership on the assessment''s linked historical Today''s Team — Employee-role correction milestone, closes a same-project IDOR that predates this task.';
