-- Real browser bug: Today's Teams' LMRA indicator stayed neutral even
-- after a real, approved LMRA existed for that exact team/day. Root
-- cause — daily_team_id was only ever wired up on ONE of the three
-- creation paths (clicking "[ LMRA ]" directly from a Today's Team card,
-- via the `?dailyTeamId=` query param). "Add My Today's Team" and "Select
-- Today's Team" (modules/lmra/components/lmra-add-my-team-button.tsx /
-- lmra-add-daily-team-dialog.tsx) only ever merged employee ids into
-- Workers Involved — neither one ever communicated which daily_teams row
-- it resolved back up to LmraForm, so create_lmra_assessment's
-- target_daily_team_id was always null for those two paths. Confirmed
-- live: every existing lmra_assessments row in the linked database has
-- daily_team_id is null, even ones created against a real team's roster.
--
-- This migration is the DB half of the fix — item 4's explicit "validate
-- server-side that team belongs to active company/project; team work_date
-- matches LMRA date" requirement, for BOTH the create and (new) edit
-- paths. The app-layer half (actually threading a resolved daily_team_id
-- through all three creation paths) is a separate, non-DB change.

-- ============================================================================
-- create_lmra_assessment(): validate target_daily_team_id, when supplied,
-- actually belongs to this exact (company, project, work_date) — the
-- existing composite FK (daily_team_id, company_id) only proves the
-- company matches, never the project or the date. A client that trusted
-- an arbitrary/stale team id would otherwise silently link an LMRA to the
-- wrong team's completion indicator.
-- ============================================================================
create or replace function public.create_lmra_assessment(
  target_company_id uuid,
  target_project_id uuid,
  target_work_area text,
  target_work_activity text,
  target_work_date date,
  target_shift public.lmra_shift,
  target_completed_by_employee_id uuid,
  target_responsible_person_id uuid,
  target_notes text,
  target_participant_employee_ids uuid[],
  target_hazards jsonb,
  target_submit boolean,
  target_result public.lmra_result default 'go',
  target_stop_work_reason text default null,
  target_daily_team_id uuid default null
)
returns public.lmra_assessments
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_assessment public.lmra_assessments;
begin
  if cardinality(target_participant_employee_ids) > 200 then
    raise exception 'too many participants (max 200)';
  end if;

  if jsonb_array_length(target_hazards) <> 12 then
    raise exception 'expected exactly 12 hazard rows';
  end if;

  if target_responsible_person_id is not null and not (target_responsible_person_id = any (target_participant_employee_ids)) then
    raise exception 'the person responsible for the work must be one of Workers Involved';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(target_hazards) as incoming(responsible_person_id uuid)
    where incoming.responsible_person_id is not null
      and not (incoming.responsible_person_id = any (target_participant_employee_ids))
  ) then
    raise exception 'a hazard''s responsible person must be one of Workers Involved';
  end if;

  if target_daily_team_id is not null and not exists (
    select 1 from public.daily_teams dt
    where dt.id = target_daily_team_id
      and dt.company_id = target_company_id
      and dt.project_id = target_project_id
      and dt.work_date = target_work_date
  ) then
    raise exception 'the selected team does not belong to this project/date — cannot link this LMRA to it';
  end if;

  insert into public.lmra_assessments (
    company_id, project_id, work_area, work_activity, work_date, shift,
    completed_by_employee_id, responsible_person_id, notes, daily_team_id, created_by, updated_by
  ) values (
    target_company_id, target_project_id, target_work_area, target_work_activity, target_work_date, target_shift,
    target_completed_by_employee_id, target_responsible_person_id, target_notes, target_daily_team_id, auth.uid(), auth.uid()
  )
  returning * into v_assessment;

  update public.lmra_hazards h
  set
    is_applicable = (incoming.is_applicable)::boolean,
    controls = nullif(btrim(incoming.controls), ''),
    selected_controls = coalesce(incoming.selected_controls, '{}'),
    responsible_person_id = incoming.responsible_person_id,
    controls_confirmed = (incoming.controls_confirmed)::boolean,
    other_description = nullif(btrim(incoming.other_description), '')
  from jsonb_to_recordset(target_hazards) as incoming(
    hazard_type public.lmra_hazard_type,
    is_applicable boolean,
    controls text,
    selected_controls text[],
    responsible_person_id uuid,
    controls_confirmed boolean,
    other_description text
  )
  where h.lmra_assessment_id = v_assessment.id
    and h.hazard_type = incoming.hazard_type;

  insert into public.lmra_participants (company_id, lmra_assessment_id, employee_id)
  select distinct target_company_id, v_assessment.id, emp_id
  from unnest(target_participant_employee_ids) as emp_id
  on conflict (lmra_assessment_id, employee_id) do nothing;

  if target_submit then
    update public.lmra_assessments
    set status = 'submitted',
        result = target_result,
        stop_work_reason = case when target_result = 'no_go' then target_stop_work_reason else null end,
        submitted_by = auth.uid(),
        submitted_at = now(),
        updated_by = auth.uid()
    where id = v_assessment.id and status = 'draft'
    returning * into v_assessment;
  end if;

  return v_assessment;
end;
$$;

comment on function public.create_lmra_assessment(uuid, uuid, text, text, date, public.lmra_shift, uuid, uuid, text, uuid[], jsonb, boolean, public.lmra_result, text, uuid) is
  'The one-shot "Save LMRA" / "Save Draft" create path. target_daily_team_id, when supplied, must genuinely belong to this exact (company, project, work_date) — never trusted from the client alone (bug fix: this is what lets Today''s Teams'' LMRA completion indicator ever turn green for a team-linked LMRA). Item 1: every responsible_person_id must be one of target_participant_employee_ids. RLS/triggers on every underlying table are the real gate (SECURITY INVOKER) — this adds atomicity, not elevation.';

revoke all on function public.create_lmra_assessment(uuid, uuid, text, text, date, public.lmra_shift, uuid, uuid, text, uuid[], jsonb, boolean, public.lmra_result, text, uuid) from public, anon;
grant execute on function public.create_lmra_assessment(uuid, uuid, text, text, date, public.lmra_shift, uuid, uuid, text, uuid[], jsonb, boolean, public.lmra_result, text, uuid) to authenticated;

-- ============================================================================
-- update_lmra_assessment(): gains an optional target_daily_team_id so
-- editing a draft that was never linked (e.g. "Add My Today's Team" used
-- while editing) can safely, explicitly link it — while a null value
-- (the default, and every existing call site until the app layer is
-- updated) PRESERVES whatever daily_team_id already exists, never clears
-- it. Same company/project/work_date validation as the create path.
-- ============================================================================
create or replace function public.update_lmra_assessment(
  target_lmra_id uuid,
  target_work_area text,
  target_work_activity text,
  target_work_date date,
  target_shift public.lmra_shift,
  target_responsible_person_id uuid,
  target_notes text,
  target_participant_employee_ids uuid[],
  target_hazards jsonb,
  target_daily_team_id uuid default null
)
returns public.lmra_assessments
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_assessment public.lmra_assessments;
  v_current_status public.lmra_status;
  v_company_id uuid;
  v_project_id uuid;
begin
  select status, company_id, project_id into v_current_status, v_company_id, v_project_id
  from public.lmra_assessments where id = target_lmra_id;

  if v_current_status is null then
    raise exception 'LMRA assessment % not found', target_lmra_id;
  end if;

  if cardinality(target_participant_employee_ids) > 200 then
    raise exception 'too many participants (max 200)';
  end if;

  if target_responsible_person_id is not null and not (target_responsible_person_id = any (target_participant_employee_ids)) then
    raise exception 'the person responsible for the work must be one of Workers Involved';
  end if;

  if v_current_status = 'draft' and exists (
    select 1
    from jsonb_to_recordset(target_hazards) as incoming(responsible_person_id uuid)
    where incoming.responsible_person_id is not null
      and not (incoming.responsible_person_id = any (target_participant_employee_ids))
  ) then
    raise exception 'a hazard''s responsible person must be one of Workers Involved';
  end if;

  if target_daily_team_id is not null and not exists (
    select 1 from public.daily_teams dt
    where dt.id = target_daily_team_id
      and dt.company_id = v_company_id
      and dt.project_id = v_project_id
      and dt.work_date = target_work_date
  ) then
    raise exception 'the selected team does not belong to this project/date — cannot link this LMRA to it';
  end if;

  update public.lmra_assessments
  set work_area = target_work_area,
      work_activity = target_work_activity,
      work_date = target_work_date,
      shift = target_shift,
      responsible_person_id = target_responsible_person_id,
      notes = target_notes,
      daily_team_id = coalesce(target_daily_team_id, daily_team_id),
      updated_by = auth.uid()
  where id = target_lmra_id
  returning * into v_assessment;

  if v_current_status = 'draft' then
    if jsonb_array_length(target_hazards) <> 12 then
      raise exception 'expected exactly 12 hazard rows';
    end if;

    update public.lmra_hazards h
    set
      is_applicable = (incoming.is_applicable)::boolean,
      controls = nullif(btrim(incoming.controls), ''),
      selected_controls = coalesce(incoming.selected_controls, '{}'),
      responsible_person_id = incoming.responsible_person_id,
      controls_confirmed = (incoming.controls_confirmed)::boolean,
      other_description = nullif(btrim(incoming.other_description), '')
    from jsonb_to_recordset(target_hazards) as incoming(
      hazard_type public.lmra_hazard_type,
      is_applicable boolean,
      controls text,
      selected_controls text[],
      responsible_person_id uuid,
      controls_confirmed boolean,
      other_description text
    )
    where h.lmra_assessment_id = target_lmra_id
      and h.hazard_type = incoming.hazard_type;

    delete from public.lmra_participants
    where lmra_assessment_id = target_lmra_id
      and employee_id <> all (target_participant_employee_ids);

    insert into public.lmra_participants (company_id, lmra_assessment_id, employee_id)
    select distinct v_company_id, target_lmra_id, emp_id
    from unnest(target_participant_employee_ids) as emp_id
    on conflict (lmra_assessment_id, employee_id) do nothing;
  end if;

  return v_assessment;
end;
$$;

comment on function public.update_lmra_assessment(uuid, text, text, date, public.lmra_shift, uuid, text, uuid[], jsonb, uuid) is
  'The one-shot edit path. target_daily_team_id defaults to null, meaning "leave the existing link untouched" (coalesce against the current value — never silently clears an existing link); pass a real team id to explicitly, safely link/relink a draft, validated the same way as create_lmra_assessment. Hazards/participants only touched while still draft. RLS/triggers are the real gate (SECURITY INVOKER).';

revoke all on function public.update_lmra_assessment(uuid, text, text, date, public.lmra_shift, uuid, text, uuid[], jsonb, uuid) from public, anon;
grant execute on function public.update_lmra_assessment(uuid, text, text, date, public.lmra_shift, uuid, text, uuid[], jsonb, uuid) to authenticated;

drop function if exists public.update_lmra_assessment(uuid, text, text, date, public.lmra_shift, uuid, text, uuid[], jsonb);
