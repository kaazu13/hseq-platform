-- Item 1: an LMRA hazard's (and the assessment-level) "Responsible person"
-- must be one of THAT LMRA's own Workers Involved (lmra_participants) —
-- not merely anyone project-rostered. Previously validate_lmra_hazard_
-- update()/validate_lmra_assessment_insert()/validate_lmra_assessment_
-- update() only checked project-roster membership; a hazard's responsible
-- person could be any project-rostered employee never added to this
-- specific LMRA's Workers Involved.
--
-- These checks live in the two write RPCs (create_lmra_assessment,
-- update_lmra_assessment), not the row-level triggers: the triggers fire
-- per-table-write, and at the moment lmra_assessments/lmra_hazards rows
-- are written, lmra_participants for THIS assessment may not exist yet
-- (assessment created before participants are inserted) — validating
-- against the RPC's own target_participant_employee_ids input array
-- (always the authoritative, just-submitted participant list) avoids that
-- ordering problem entirely and is a single, deterministic place a raw
-- client call cannot bypass (never relying only on the UI).

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
  'The one-shot "Save LMRA" / "Save Draft" create path. Item 1: every responsible_person_id (assessment-level and per-hazard) must be one of target_participant_employee_ids — rejected atomically before any row is written, never merely a UI-level restriction. RLS/triggers on every underlying table are the real gate (SECURITY INVOKER) — this adds atomicity, not elevation.';

revoke all on function public.create_lmra_assessment(uuid, uuid, text, text, date, public.lmra_shift, uuid, uuid, text, uuid[], jsonb, boolean, public.lmra_result, text, uuid) from public, anon;
grant execute on function public.create_lmra_assessment(uuid, uuid, text, text, date, public.lmra_shift, uuid, uuid, text, uuid[], jsonb, boolean, public.lmra_result, text, uuid) to authenticated;

create or replace function public.update_lmra_assessment(
  target_lmra_id uuid,
  target_work_area text,
  target_work_activity text,
  target_work_date date,
  target_shift public.lmra_shift,
  target_responsible_person_id uuid,
  target_notes text,
  target_participant_employee_ids uuid[],
  target_hazards jsonb
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
begin
  select status, company_id into v_current_status, v_company_id
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

  update public.lmra_assessments
  set work_area = target_work_area,
      work_activity = target_work_activity,
      work_date = target_work_date,
      shift = target_shift,
      responsible_person_id = target_responsible_person_id,
      notes = target_notes,
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

comment on function public.update_lmra_assessment(uuid, text, text, date, public.lmra_shift, uuid, text, uuid[], jsonb) is
  'The one-shot edit path. Item 1: responsible_person_id (assessment-level always; per-hazard while draft) must be one of target_participant_employee_ids, rejected atomically. Hazards/participants only touched while still draft (silently skipped otherwise, matching the read-only UI). RLS/triggers are the real gate (SECURITY INVOKER).';

revoke all on function public.update_lmra_assessment(uuid, text, text, date, public.lmra_shift, uuid, text, uuid[], jsonb) from public, anon;
grant execute on function public.update_lmra_assessment(uuid, text, text, date, public.lmra_shift, uuid, text, uuid[], jsonb) to authenticated;
