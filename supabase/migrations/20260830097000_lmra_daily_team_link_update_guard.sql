-- Operational audit finding (data-integrity gap, RPC-only enforcement):
-- 20260825090000_lmra_daily_team_link_fix.sql taught
-- create_lmra_assessment()/update_lmra_assessment() to validate that a
-- supplied target_daily_team_id genuinely belongs to the exact same
-- (company, project, work_date) as the LMRA it's being linked to — the
-- composite FK (daily_team_id, company_id) alone only proves the company
-- matches, never the project or the date. That check lives entirely in
-- the two RPCs; validate_lmra_assessment_update() (the real BEFORE
-- UPDATE backstop) never validates daily_team_id at all. A manage-tier
-- user can therefore PATCH lmra_assessments.daily_team_id directly via
-- PostgREST to a daily_teams row from a different project or a different
-- work_date, silently mislinking the LMRA (and corrupting Today's Teams'
-- LMRA-completion indicator, the exact bug this whole feature exists to
-- avoid). Live-confirmed: a direct PATCH linking an LMRA (work_date
-- 2030-01-02) to a daily_teams row dated 2026-08-15 for the same project
-- succeeded with HTTP 200 and persisted.
--
-- Fix: extend validate_lmra_assessment_update() (already touched by
-- 20260830096000 for the responsible_person_id/participant guard) with
-- the same project+work_date match check the RPCs already do. No
-- ordering problem here — daily_teams rows already exist independently
-- of this assessment, so this is a straightforward re-check, mirroring
-- the RPCs' own logic exactly.
create or replace function public.validate_lmra_assessment_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
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

  -- NEW: daily_team_id, whenever it changes, must belong to this exact
  -- (company, project, work_date) — mirrors create_lmra_assessment()/
  -- update_lmra_assessment()'s own check (20260825090000), now enforced
  -- against a raw UPDATE too, not only the RPCs' input validation.
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
  'completed_by_employee_id is immutable. responsible_person_id, whenever it changes, must be project-rostered AND one of this assessment''s own lmra_participants rows. daily_team_id, whenever it changes, must belong to this exact (company, project, work_date) — both mirror create_lmra_assessment()/update_lmra_assessment()''s own checks, now also closed against a raw UPDATE bypassing those RPCs entirely. Archiving requires HSE Manager; an archived row is otherwise immutable.';
