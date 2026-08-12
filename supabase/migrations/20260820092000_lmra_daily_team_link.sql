-- Item 5: LMRA completion status on the Today's Team card. daily-team-card.tsx
-- already links "[ LMRA ]" to `/lmra/new?dailyTeamId=${team.id}&workDate=${workDate}`,
-- but lmra_assessments never actually PERSISTED that link — there is no
-- column to precisely answer "has an LMRA been created for this exact
-- team/day" (confirmed: no daily_team_id anywhere in lmra_assessments/
-- lmra_participants). Fuzzy matching via lmra_participants overlap would
-- risk exactly the false positive this milestone explicitly warns against
-- ("do NOT mark a team green because some unrelated LMRA exists for the
-- same project") — a precise FK is the correct fix, mirroring
-- safety_observations.target_daily_team_id's identical pattern
-- (20260814090000_observation_targeting.sql).
alter table public.lmra_assessments
  add column daily_team_id uuid;

alter table public.lmra_assessments
  add constraint lmra_assessments_daily_team_fk foreign key (daily_team_id, company_id) references public.daily_teams (id, company_id) on delete set null;

create index lmra_assessments_daily_team_idx on public.lmra_assessments (daily_team_id) where archived_at is null;

comment on column public.lmra_assessments.daily_team_id is
  'References the ONE specific daily_teams row this LMRA was created from (via "[ LMRA ]" on a Today''s Team card), if any — precise, never re-resolved by matching participants/work_area/date. Nullable: an LMRA can still be created independently of any specific team. ON DELETE SET NULL — losing this link never blocks deleting/archiving the team (which cannot happen anyway, teams are never hard-deleted) and never invalidates the LMRA itself.';

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
  'The one-shot "Save LMRA" / "Save Draft" create path — creates the assessment (now optionally pinned to the exact daily_teams row it was started from, item 5), bulk-updates its pre-seeded 12 hazard rows, inserts participants (deduplicated), and optionally moves straight to submitted with the go/no-go decision, all in one transaction. RLS/triggers on every underlying table are the real gate (SECURITY INVOKER) — this adds atomicity, not elevation.';

revoke all on function public.create_lmra_assessment(uuid, uuid, text, text, date, public.lmra_shift, uuid, uuid, text, uuid[], jsonb, boolean, public.lmra_result, text, uuid) from public, anon;
grant execute on function public.create_lmra_assessment(uuid, uuid, text, text, date, public.lmra_shift, uuid, uuid, text, uuid[], jsonb, boolean, public.lmra_result, text, uuid) to authenticated;

drop function if exists public.create_lmra_assessment(uuid, uuid, text, text, date, public.lmra_shift, uuid, uuid, text, uuid[], jsonb, boolean, public.lmra_result, text);
