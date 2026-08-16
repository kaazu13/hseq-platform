-- ============================================================================
-- Fixes a critical regression in 20260901097000_employee_role_correction_lmra_involvement_scope.sql:
-- its new lmra_assessments_select policy directly sub-selected
-- lmra_participants and lmra_hazards inside its own USING clause. Both of
-- those tables' own SELECT policies (lmra_participants_select,
-- lmra_hazards_select, 20260801090000_lmra.sql) sub-select back into
-- lmra_assessments to check project access — so evaluating
-- lmra_assessments_select triggered lmra_participants_select, which
-- triggered lmra_assessments_select again, forever: Postgres error 42P17
-- "infinite recursion detected in policy for relation lmra_participants".
-- Confirmed live in the dev server log — this broke LMRA-touching queries
-- (including Your Dashboard's "today's LMRA" card) for EVERY caller, not
-- just Employee, the moment the previous migration was applied.
--
-- Fix: move the involvement lookup into a SECURITY DEFINER helper
-- function. A SECURITY DEFINER function runs with its owner's privileges
-- and does not re-trigger RLS on the tables it queries directly — the
-- same reason every cross-table "is this visible to me" check in this
-- schema (is_company_member, has_project_access, etc.) is already a
-- SECURITY DEFINER function rather than an inline RLS sub-select. This is
-- a mechanical fix only — the actual involvement criteria (completed-by,
-- assessment/hazard-level responsible person, participant, or historical
-- daily-team membership) are unchanged from the previous migration.
-- ============================================================================
create or replace function public.employee_is_involved_in_lmra(target_lmra_assessment_id uuid, target_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.lmra_assessments a
    where a.id = target_lmra_assessment_id
      and (
        a.completed_by_employee_id = target_employee_id
        or a.responsible_person_id = target_employee_id
        or exists (select 1 from public.lmra_participants lp where lp.lmra_assessment_id = a.id and lp.employee_id = target_employee_id)
        or exists (select 1 from public.lmra_hazards lh where lh.lmra_assessment_id = a.id and lh.responsible_person_id = target_employee_id)
        or (
          a.daily_team_id is not null
          and exists (select 1 from public.daily_team_members dtm where dtm.daily_team_id = a.daily_team_id and dtm.employee_id = target_employee_id)
        )
      )
  );
$$;

comment on function public.employee_is_involved_in_lmra(uuid, uuid) is
  'SECURITY DEFINER so lmra_assessments_select can check involvement without re-triggering lmra_participants_select/lmra_hazards_select (which themselves sub-select lmra_assessments) — a plain inline sub-select here caused infinite RLS recursion (42P17), fixed by this function. See this migration''s header comment.';

revoke all on function public.employee_is_involved_in_lmra(uuid, uuid) from public, anon;
grant execute on function public.employee_is_involved_in_lmra(uuid, uuid) to authenticated;

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
          and public.employee_is_involved_in_lmra(lmra_assessments.id, e.id)
      )
    )
  );

comment on policy lmra_assessments_select on public.lmra_assessments is
  'Company-wide managers, or any other project member EXCEPT a plain employee (unchanged from before this migration for every non-employee role). A plain employee instead needs genuine involvement per employee_is_involved_in_lmra() — completed-by, assessment/hazard-level responsible person, a listed participant, or membership on the assessment''s linked historical Today''s Team. Employee-role correction milestone; fixed for infinite recursion by 20260901099000.';
