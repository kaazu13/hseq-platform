-- Task 3 Part 1 finding (live-tested as test.employee@example.test): a
-- plain Employee — the creator of their own submitted LMRA assessment —
-- could call the app's reviewLmra()/reopenLmra() actions (both gated only
-- by requireLmraManageAccess()/canManageLmra(), whose isOwnAssessment
-- branch was designed for pre-submission self-editing, not review
-- decisions) to move their OWN assessment from 'submitted' straight to
-- 'approved'/'rejected', or reopen it from 'approved'/'rejected' back to
-- 'draft' — a genuine self-approval bug, same shape/class as the
-- equipment_requests self-approval bug fixed in
-- 20260901104000_fix_equipment_request_self_approval.sql.
--
-- Root cause (RLS layer): lmra_assessments_update's USING/WITH CHECK
-- grants access whenever is_own_employee(completed_by_employee_id) holds,
-- with no awareness of WHICH status transition is being attempted — the
-- same columns (status/reviewed_by/reviewed_at/review_notes/approved_at)
-- are writable whether the caller is editing their own draft or attempting
-- a review decision. A direct PostgREST PATCH bypassing the app's server
-- actions entirely would ALSO succeed today. validate_lmra_assessment_update()
-- (the real BEFORE UPDATE backstop) is the correct, already-precedented
-- place to close this — it already restricts the 'archived' transition to
-- hseq_manager only, for exactly this "RLS alone is too permissive" reason
-- (see its own header comment in 20260801090000_lmra.sql).
--
-- Fix: extend validate_lmra_assessment_update() with a review-decision-
-- transition guard. A "review decision" transition is submitted ->
-- approved/rejected, or a reopen: approved/rejected -> draft. Either
-- requires the caller hold genuine reviewer authority — the same role set
-- as canViewAllProjectLmra()'s existing "sees more than just my own LMRA"
-- precedent (project foreman, hseq_manager, company_admin,
-- operations_manager, project_manager) plus hse_officer (named explicitly
-- for this requirement) and platform_super_admin. hse_officer/
-- project_manager are scoped to has_project_access() (project-scoped
-- roles, matching is_scaffold_manage_tier()'s established company-wide-
-- vs-project-scoped split); hseq_manager/company_admin/operations_manager
-- remain company-wide, matching that same precedent. Submitting
-- (draft -> submitted) and any other own-assessment edit are completely
-- untouched by this check — only the two review-decision transitions are
-- gated.
create or replace function public.validate_lmra_assessment_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_is_review_transition boolean;
  v_is_reviewer boolean;
begin
  if old.status = 'archived' then
    raise exception 'an archived LMRA assessment cannot be modified';
  end if;

  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.project_id is distinct from old.project_id
    or new.completed_by_employee_id is distinct from old.completed_by_employee_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'LMRA identity/creation fields cannot be changed';
  end if;

  if new.status = 'archived' and old.status <> 'archived' then
    if not public.has_company_role(new.company_id, 'hseq_manager') then
      raise exception 'only an HSE Manager may archive an LMRA assessment';
    end if;
  end if;

  v_is_review_transition :=
    (old.status = 'submitted' and new.status in ('approved', 'rejected'))
    or (old.status in ('approved', 'rejected') and new.status = 'draft');

  if v_is_review_transition then
    v_is_reviewer :=
      public.is_platform_super_admin()
      or public.has_any_company_role(new.company_id, array['hseq_manager', 'company_admin', 'operations_manager'])
      or (public.has_project_access(new.project_id) and public.has_any_company_role(new.company_id, array['hse_officer', 'project_manager']))
      or public.is_project_foreman(new.project_id);

    if not v_is_reviewer then
      raise exception 'you are not authorized to review this LMRA assessment';
    end if;
  end if;

  if new.responsible_person_id is distinct from old.responsible_person_id and new.responsible_person_id is not null then
    perform public.assert_employee_eligible_for_assignment(new.responsible_person_id);
    if not exists (
      select 1 from public.project_assignments pa
      where pa.project_id = new.project_id and pa.company_id = new.company_id
        and pa.employee_id = new.responsible_person_id and pa.end_at is null
    ) then
      raise exception 'the person responsible for the work (%) is not currently assigned to this project', new.responsible_person_id;
    end if;

    if not exists (
      select 1 from public.lmra_participants lp
      where lp.lmra_assessment_id = new.id and lp.employee_id = new.responsible_person_id
    ) then
      raise exception 'the person responsible for the work (%) must be one of this LMRA''s Workers Involved', new.responsible_person_id;
    end if;
  end if;

  if new.daily_team_id is distinct from old.daily_team_id and new.daily_team_id is not null and not exists (
    select 1 from public.daily_teams dt
    where dt.id = new.daily_team_id
      and dt.company_id = new.company_id
      and dt.project_id = new.project_id
      and dt.work_date = new.work_date
  ) then
    raise exception 'the selected team does not belong to this project/date — cannot link this LMRA to it';
  end if;

  return new;
end;
$$;

comment on function public.validate_lmra_assessment_update() is
  'completed_by_employee_id is immutable. A review-decision transition (submitted -> approved/rejected, or approved/rejected -> draft) requires genuine reviewer authority (project foreman, hseq_manager, hse_officer, company_admin, operations_manager, project_manager, or platform_super_admin) — closes the self-approval gap RLS''s is_own_employee() branch alone would otherwise allow (20260901107000). responsible_person_id, whenever it changes, must be project-rostered AND one of this assessment''s own lmra_participants rows. daily_team_id, whenever it changes, must belong to this exact (company, project, work_date). Archiving requires HSE Manager; an archived row is otherwise immutable.';
