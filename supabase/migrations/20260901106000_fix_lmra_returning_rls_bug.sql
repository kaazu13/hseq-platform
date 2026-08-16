-- CRITICAL fix, caught by live testing while building realistic
-- role-validation fixture data: a plain employee could not create (or
-- edit, or submit) ANY LMRA at all — not even their own, for their own
-- team — despite RLS/permissions being entirely correct. Confirmed via
-- extensive isolation testing (standalone RPC calls to is_company_member/
-- has_project_access/is_own_employee/employee_is_involved_in_lmra all
-- returned exactly the expected `true`; a plain `INSERT` with no
-- `RETURNING` clause succeeded every time; a SEPARATE follow-up `SELECT`
-- immediately afterward could see the row fine) — the failure is
-- Postgres's well-known `INSERT/UPDATE ... RETURNING` + RLS interaction:
-- when a SELECT policy's USING clause depends on OTHER rows via a
-- subquery (here, `lmra_assessments_select`'s employee-involvement branch
-- queries `employees`/`lmra_participants`/`lmra_hazards`/
-- `daily_team_members`, not just the row's own columns), Postgres cannot
-- reliably re-check that SELECT policy against the just-written row
-- WITHIN THE SAME command as the write — the write itself succeeds (its
-- own WITH CHECK passes) but the RETURNING re-select raises "new row
-- violates row-level security policy", generically blamed on the same
-- table. This exact call pattern is what create_lmra_assessment()/
-- update_lmra_assessment() use internally (`returning * into
-- v_assessment`), and it's SECURITY INVOKER by design (the INSERT/UPDATE
-- itself must run as the real caller so RLS enforces who may create/edit
-- what) — so this bug affected every plain-employee LMRA create/edit/
-- submit, the single most common real-world path in this feature
-- (hseq_manager and project-foreman callers were unaffected, since their
-- SELECT-policy branch is a simple company-wide role check, not
-- row-data-dependent, which is why this was never caught by role-elevated
-- testing before).
--
-- Fix: never combine a write with RETURNING for these two functions.
-- Generate the row's id explicitly, write without RETURNING (already
-- proven to always succeed), then read it back through a new, narrow
-- SECURITY DEFINER helper — this codebase's own established pattern for
-- "a caller needs to see something my write already proved they're
-- entitled to, but the ordinary SELECT-policy-during-RETURNING path can't
-- reliably grant it" (mirrors get_basic_employee_info/is_own_employee/
-- employee_is_involved_in_lmra, all SECURITY DEFINER for related reasons).
-- No authorization is added or removed: every existing INSERT/UPDATE
-- WITH CHECK, hazard/participant validation, and RLS SELECT policy is
-- completely unchanged — only HOW the already-authorized row is read back
-- for the function's return value changes.
create or replace function public.get_lmra_assessment_row(target_id uuid)
returns public.lmra_assessments
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select * from public.lmra_assessments where id = target_id;
$$;

comment on function public.get_lmra_assessment_row(uuid) is
  'SECURITY DEFINER read-back for create_lmra_assessment()/update_lmra_assessment() — see this migration''s header for the INSERT/UPDATE...RETURNING + RLS bug this works around. Never call this to bypass lmra_assessments_select for an arbitrary id from outside those two functions; it grants no authorization of its own, it only avoids Postgres''s RETURNING-time re-check for a row the caller''s own write JUST proved they may act on.';

revoke all on function public.get_lmra_assessment_row(uuid) from public, anon;
grant execute on function public.get_lmra_assessment_row(uuid) to authenticated;

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
  v_new_id uuid := gen_random_uuid();
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
    id, company_id, project_id, work_area, work_activity, work_date, shift,
    completed_by_employee_id, responsible_person_id, notes, daily_team_id, created_by, updated_by
  ) values (
    v_new_id, target_company_id, target_project_id, target_work_area, target_work_activity, target_work_date, target_shift,
    target_completed_by_employee_id, target_responsible_person_id, target_notes, target_daily_team_id, auth.uid(), auth.uid()
  );

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
  where h.lmra_assessment_id = v_new_id
    and h.hazard_type = incoming.hazard_type;

  insert into public.lmra_participants (company_id, lmra_assessment_id, employee_id)
  select distinct target_company_id, v_new_id, emp_id
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
    where id = v_new_id and status = 'draft';
  end if;

  v_assessment := public.get_lmra_assessment_row(v_new_id);
  if v_assessment.id is null then
    raise exception 'failed to read back the newly created LMRA assessment';
  end if;

  return v_assessment;
end;
$$;

comment on function public.create_lmra_assessment(uuid, uuid, text, text, date, public.lmra_shift, uuid, uuid, text, uuid[], jsonb, boolean, public.lmra_result, text, uuid) is
  'The one-shot "Save LMRA" / "Save Draft" create path. Fixed for the INSERT...RETURNING + RLS bug (this migration''s header) — id is generated up front, every write omits RETURNING, and the final return value is read back via get_lmra_assessment_row(). target_daily_team_id, when supplied, must genuinely belong to this exact (company, project, work_date) — never trusted from the client alone. Item 1: every responsible_person_id must be one of target_participant_employee_ids. RLS/triggers on every underlying table remain the real authorization gate (SECURITY INVOKER) — this fix changes nothing about who may do what, only how the already-authorized result row is read back.';

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
  where id = target_lmra_id;

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

  v_assessment := public.get_lmra_assessment_row(target_lmra_id);
  if v_assessment.id is null then
    raise exception 'failed to read back the updated LMRA assessment';
  end if;

  return v_assessment;
end;
$$;

comment on function public.update_lmra_assessment(uuid, text, text, date, public.lmra_shift, uuid, text, uuid[], jsonb, uuid) is
  'The one-shot edit path. Fixed for the same UPDATE...RETURNING + RLS bug as create_lmra_assessment() (see this migration''s header) — the write omits RETURNING and the return value is read back via get_lmra_assessment_row(). target_daily_team_id defaults to null, meaning "leave the existing link untouched" (coalesce against the current value — never silently clears an existing link). Hazards/participants only touched while still draft. RLS/triggers remain the real authorization gate (SECURITY INVOKER) — unchanged by this fix.';

revoke all on function public.update_lmra_assessment(uuid, text, text, date, public.lmra_shift, uuid, text, uuid[], jsonb, uuid) from public, anon;
grant execute on function public.update_lmra_assessment(uuid, text, text, date, public.lmra_shift, uuid, text, uuid[], jsonb, uuid) to authenticated;
