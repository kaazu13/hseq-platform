-- Operational audit finding (data-integrity gap, RPC-only enforcement):
-- 20260823090000_lmra_responsible_person_participant_check.sql taught
-- create_lmra_assessment()/update_lmra_assessment() that an LMRA's
-- responsible_person_id must be one of THAT LMRA's own Workers Involved
-- (lmra_participants), not merely anyone project-rostered — but that
-- migration's own header comment explains the check was deliberately put
-- ONLY in the two RPCs, never a trigger, because at INSERT time
-- lmra_participants for a brand-new assessment id cannot exist yet.
--
-- The gap this leaves: validate_lmra_assessment_update() (the real
-- BEFORE UPDATE backstop every write ultimately goes through) still only
-- re-validates responsible_person_id against project-roster membership
-- (the OLDER, broader rule from 20260816090000) — never against this
-- specific assessment's lmra_participants. A manage-tier user (HSE
-- Manager / the project's own Foreman / the assessment's own owner —
-- lmra_assessments_update's RLS grantees) can therefore PATCH
-- responsible_person_id directly via PostgREST to any project-rostered
-- employee, even one never added to this LMRA's Workers Involved.
-- Live-confirmed: a direct PATCH succeeded (HTTP 200) setting
-- responsible_person_id to a project-rostered employee who was not one
-- of the assessment's lmra_participants rows.
--
-- Fix: extend validate_lmra_assessment_update() with the same
-- participant check the RPCs already do. Unlike INSERT, this ordering
-- problem does not apply here — by the time an UPDATE trigger fires, the
-- row (and therefore its lmra_participants) already exist. The one
-- remaining wrinkle is update_lmra_assessment() itself: it currently
-- updates lmra_assessments.responsible_person_id BEFORE syncing
-- lmra_participants to the new target list, so a legitimate "add this
-- person as both a new participant AND the responsible person in the
-- same save" call would trip the new trigger check against the
-- STALE (pre-sync) participant list. Reordering the RPC's own internal
-- statements (participant sync first, assessment update second) closes
-- that without changing its external behavior at all — same technique
-- already used in update_daily_team_with_foreman() ("Foreman swap FIRST
-- ... before the shift-conflict check").
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

    -- NEW: must also be one of THIS assessment's own Workers Involved —
    -- mirrors create_lmra_assessment()/update_lmra_assessment()'s own
    -- RPC-level check (20260823090000), now enforced against a raw
    -- UPDATE too, not only the RPC's input array.
    if not exists (
      select 1 from public.lmra_participants lp
      where lp.lmra_assessment_id = new.id and lp.employee_id = new.responsible_person_id
    ) then
      raise exception 'the person responsible for the work (%) must be one of this LMRA''s Workers Involved', new.responsible_person_id;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.validate_lmra_assessment_update() is
  'completed_by_employee_id is immutable. responsible_person_id, whenever it changes, must be project-rostered AND (new) one of this specific assessment''s own lmra_participants rows — the same "Workers Involved" rule create_lmra_assessment()/update_lmra_assessment() already enforce, now also closed against a raw UPDATE bypassing those RPCs entirely. Archiving requires HSE Manager; an archived row is otherwise immutable.';

-- ============================================================================
-- update_lmra_assessment(): reorder so the draft-only participant sync
-- (delete stale + insert target list) happens BEFORE the assessment row's
-- own UPDATE, not after. Purely an internal statement-order change — same
-- external signature/behavior — so that validate_lmra_assessment_update()'s
-- new participant check above (fired by the assessment UPDATE) always
-- sees the POST-edit participant list, never the stale pre-edit one. Every
-- other rule (hazard sync, daily_team_id validation, notifications) is
-- unchanged.
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

  -- Participant sync MOVED UP (see header comment): must land before the
  -- lmra_assessments UPDATE below so a same-call "make this new
  -- participant the responsible person too" edit is validated against the
  -- real, final participant list rather than the stale pre-edit one.
  if v_current_status = 'draft' then
    delete from public.lmra_participants
    where lmra_assessment_id = target_lmra_id
      and employee_id <> all (target_participant_employee_ids);

    insert into public.lmra_participants (company_id, lmra_assessment_id, employee_id)
    select distinct v_company_id, target_lmra_id, emp_id
    from unnest(target_participant_employee_ids) as emp_id
    on conflict (lmra_assessment_id, employee_id) do nothing;
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
  end if;

  return v_assessment;
end;
$$;

comment on function public.update_lmra_assessment(uuid, text, text, date, public.lmra_shift, uuid, text, uuid[], jsonb, uuid) is
  'The one-shot edit path. target_daily_team_id defaults to null, meaning "leave the existing link untouched". Item 1: responsible_person_id must be one of target_participant_employee_ids, rejected atomically. Participants are synced BEFORE the assessment row''s own UPDATE (order fix, see 20260830096000) so validate_lmra_assessment_update()''s own participant re-check always sees the final, post-edit list. Hazards/participants only touched while still draft. RLS/triggers are the real gate (SECURITY INVOKER).';

revoke all on function public.update_lmra_assessment(uuid, text, text, date, public.lmra_shift, uuid, text, uuid[], jsonb, uuid) from public, anon;
grant execute on function public.update_lmra_assessment(uuid, text, text, date, public.lmra_shift, uuid, text, uuid[], jsonb, uuid) to authenticated;
