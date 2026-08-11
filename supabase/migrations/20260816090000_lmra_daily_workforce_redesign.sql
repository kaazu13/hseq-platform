-- LMRA workflow/UI redesign — integrates with the completed Daily Workforce
-- / Today's Teams architecture and opens LMRA creation to ordinary eligible
-- project workers, not only Foremen.
--
-- ============================================================================
-- 1) Creator / responsibility model (Phase 1)
-- ============================================================================
-- The old model conflated "who completed the LMRA" with "who is the
-- responsible foreman" into a single required responsible_foreman_id column
-- — a natural consequence of only Foremen ever being allowed to create one.
-- Now that any eligible project worker may create an LMRA, those are split:
--   completed_by_employee_id (renamed from responsible_foreman_id, still
--     NOT NULL, still ON DELETE RESTRICT — an LMRA must always show who
--     completed it) — "LMRA completed by."
--   responsible_person_id (new, nullable, ON DELETE SET NULL) — the
--     separate, OPTIONAL "person responsible for the work" (operational/
--     supervisory accountability), never required and never conflated with
--     completed_by_employee_id.
-- created_by (the profile/auth-user id) is untouched — this migration only
-- adds the employee-level "who completed it" reference alongside it, per
-- this milestone's explicit "preserve created_by_user_id AND completed_by
-- employee/membership reference" requirement.
alter table public.lmra_assessments rename column responsible_foreman_id to completed_by_employee_id;
alter table public.lmra_assessments rename constraint lmra_assessments_foreman_fk to lmra_assessments_completed_by_fk;
alter index lmra_assessments_foreman_id_idx rename to lmra_assessments_completed_by_idx;

comment on column public.lmra_assessments.completed_by_employee_id is
  '"LMRA completed by" — the employee who actually filled in/completed this assessment. Auto-selected to the caller''s own linked employee record when they are an eligible project worker; immutable after creation (see validate_lmra_assessment_update() below), same as created_by/created_at. ON DELETE RESTRICT — an LMRA must always show who completed it.';

alter table public.lmra_assessments
  add column responsible_person_id uuid;

alter table public.lmra_assessments
  add constraint lmra_assessments_responsible_person_fk
    foreign key (responsible_person_id, company_id) references public.employees (id, company_id) on delete set null;

create index lmra_assessments_responsible_person_idx on public.lmra_assessments (responsible_person_id);

comment on column public.lmra_assessments.responsible_person_id is
  '"Person responsible for the work" — a SEPARATE, OPTIONAL field for operational/supervisory accountability, deliberately never conflated with completed_by_employee_id ("who completed the LMRA" vs "who is supervising/responsible for the work" are two different questions this milestone requires kept distinct). ON DELETE SET NULL — informational only, not evidentiary in the way completed_by_employee_id is.';

-- ============================================================================
-- 2) Controlled shift enum (Phase 2)
-- ============================================================================
create type public.lmra_shift as enum ('day', 'night', 'late');

comment on type public.lmra_shift is
  'Controlled shift vocabulary for LMRA (Day Shift / Night Shift / Late Shift) — LMRA-scoped only; daily_teams.shift/daily_team_members.shift remain free text (this milestone''s explicit "do not refactor unrelated modules broadly" scope).';

-- Existing rows are free text ("Day", "DAY", etc. — confirmed via a direct
-- production data check before writing this migration, only Day-shift
-- variants exist today). USING maps every known variant case-insensitively;
-- anything unrecognized falls back to 'day' rather than failing the
-- migration outright — safe because the same check confirmed no row
-- currently holds an unrecognized value.
alter table public.lmra_assessments
  alter column shift type public.lmra_shift using (
    case
      when lower(btrim(shift)) in ('day', 'day shift') then 'day'::public.lmra_shift
      when lower(btrim(shift)) in ('night', 'night shift') then 'night'::public.lmra_shift
      when lower(btrim(shift)) in ('late', 'late shift') then 'late'::public.lmra_shift
      else 'day'::public.lmra_shift
    end
  );

-- ============================================================================
-- 3) Control measures: predefined + custom (Phase 5)
-- ============================================================================
-- `controls` (existing, free text) is repurposed as the ONE "additional
-- custom control measure" field — no rename needed, it already served as
-- free text. `selected_controls` is new: which of the fixed, hazard-type-
-- specific predefined common controls (modules/lmra/types.ts's
-- LMRA_COMMON_CONTROLS — a fixed TS-side catalogue, not organization-
-- configurable, same "fixed v1 catalogue" precedent as LMRA_HAZARD_TYPES
-- itself) were checked. Exact string matching against that catalogue is
-- validated at the application layer (Zod) — the DB only bounds the array
-- size as a defensive backstop against a raw/malicious direct call.
alter table public.lmra_hazards
  add column selected_controls text[] not null default '{}';

alter table public.lmra_hazards
  add constraint lmra_hazards_selected_controls_limit check (cardinality(selected_controls) <= 20);

comment on column public.lmra_hazards.selected_controls is
  'Which of this hazard type''s fixed predefined common controls (modules/lmra/types.ts LMRA_COMMON_CONTROLS) were checked — exact-string validated against that catalogue at the application layer.';
comment on column public.lmra_hazards.controls is
  'The ONE additional/custom control measure the completer typed, beyond the predefined checklist (selected_controls) — free text, distinct from it.';

-- ============================================================================
-- 4) Input limits (Phase 10) — DB-level backstop; Zod is the primary gate
-- ============================================================================
alter table public.lmra_assessments
  add constraint lmra_work_area_limit check (char_length(work_area) <= 100),
  add constraint lmra_work_activity_limit check (char_length(work_activity) <= 200),
  add constraint lmra_notes_limit check (notes is null or char_length(notes) <= 2000),
  add constraint lmra_stop_work_reason_limit check (stop_work_reason is null or char_length(stop_work_reason) <= 2000),
  add constraint lmra_review_notes_limit check (review_notes is null or char_length(review_notes) <= 2000);

alter table public.lmra_hazards
  add constraint lmra_hazards_controls_limit check (controls is null or char_length(controls) <= 1000),
  add constraint lmra_hazards_other_description_limit check (other_description is null or char_length(other_description) <= 150);

-- ============================================================================
-- 5) Eligibility trigger updates
-- ============================================================================
-- INSERT: completed_by_employee_id (renamed) must be project-rostered, not
-- merely company-wide eligible — this makes explicit at the DB level what
-- the old UI's project-scoped candidate list already implied, and extends
-- the same check to the new optional responsible_person_id.
create or replace function public.validate_lmra_assessment_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.assert_project_not_archived(new.project_id);
  perform public.assert_employee_eligible_for_assignment(new.completed_by_employee_id);

  if not exists (
    select 1 from public.project_assignments pa
    where pa.project_id = new.project_id and pa.company_id = new.company_id
      and pa.employee_id = new.completed_by_employee_id and pa.end_at is null
  ) then
    raise exception 'the employee completing this LMRA (%) is not currently assigned to this project', new.completed_by_employee_id;
  end if;

  if new.responsible_person_id is not null then
    perform public.assert_employee_eligible_for_assignment(new.responsible_person_id);
    if not exists (
      select 1 from public.project_assignments pa
      where pa.project_id = new.project_id and pa.company_id = new.company_id
        and pa.employee_id = new.responsible_person_id and pa.end_at is null
    ) then
      raise exception 'the person responsible for the work (%) is not currently assigned to this project', new.responsible_person_id;
    end if;
  end if;

  return new;
end;
$$;

-- UPDATE: completed_by_employee_id becomes an immutable identity field
-- (same tier as created_by/created_at) — "who completed it" is a fact
-- recorded at creation time, never reassigned, which is also what makes the
-- self-scoped RLS branches below safe (is_own_lmra_assessment()'s answer
-- can never be changed out from under the access check it backs). Also
-- validates responsible_person_id's project-roster membership whenever it's
-- newly set, mirroring the INSERT trigger's own check.
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
  end if;

  return new;
end;
$$;

-- Same project-roster check extended to lmra_hazards.responsible_person_id
-- whenever it changes — the per-hazard "Responsible person" field.
create or replace function public.validate_lmra_hazard_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid;
  v_company_id uuid;
begin
  perform public.assert_lmra_assessment_is_draft(new.lmra_assessment_id);
  if new.lmra_assessment_id is distinct from old.lmra_assessment_id
    or new.hazard_type is distinct from old.hazard_type
    or new.company_id is distinct from old.company_id then
    raise exception 'a hazard row''s assessment/type/company cannot be changed';
  end if;

  if new.responsible_person_id is distinct from old.responsible_person_id and new.responsible_person_id is not null then
    select project_id, company_id into v_project_id, v_company_id from public.lmra_assessments where id = new.lmra_assessment_id;
    perform public.assert_employee_eligible_for_assignment(new.responsible_person_id);
    if not exists (
      select 1 from public.project_assignments pa
      where pa.project_id = v_project_id and pa.company_id = v_company_id
        and pa.employee_id = new.responsible_person_id and pa.end_at is null
    ) then
      raise exception 'a hazard''s responsible person (%) is not currently assigned to this project', new.responsible_person_id;
    end if;
  end if;

  return new;
end;
$$;

-- Participants: must be genuinely project-rostered, not merely company-wide
-- eligible — this is new (the old trigger only checked company-wide
-- eligibility; the old UI's project-scoped candidate list was the ONLY
-- thing preventing a cross-project id before this).
create or replace function public.validate_lmra_participant_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid;
  v_company_id uuid;
begin
  perform public.assert_employee_eligible_for_assignment(new.employee_id);

  select project_id, company_id into v_project_id, v_company_id
  from public.lmra_assessments where id = new.lmra_assessment_id;

  if not exists (
    select 1 from public.project_assignments pa
    where pa.project_id = v_project_id and pa.company_id = v_company_id
      and pa.employee_id = new.employee_id and pa.end_at is null
  ) then
    raise exception 'employee % is not currently assigned to this LMRA''s project', new.employee_id;
  end if;

  return new;
end;
$$;

-- ============================================================================
-- 6) RLS: open creation to eligible project workers, not only Foremen
-- ============================================================================
-- Self-scoped SECURITY DEFINER helpers, mirroring is_daily_team_foreman()'s
-- exact "narrow, single-row grant" shape — never a broadening of visibility
-- into other people's data, only "is this MY OWN record."
create or replace function public.is_own_employee(target_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.employees e
    where e.id = target_employee_id and e.profile_id = auth.uid()
  );
$$;

comment on function public.is_own_employee(uuid) is
  'True if target_employee_id resolves to the calling user''s own linked employee row. SECURITY DEFINER — called from within RLS (lmra_assessments'' INSERT/UPDATE policies) so a SECURITY INVOKER version would re-trigger those same policies.';

revoke all on function public.is_own_employee(uuid) from public, anon;
grant execute on function public.is_own_employee(uuid) to authenticated;

create or replace function public.is_own_lmra_assessment(target_lmra_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.lmra_assessments a
    join public.employees e on e.id = a.completed_by_employee_id
    where a.id = target_lmra_id and e.profile_id = auth.uid()
  );
$$;

comment on function public.is_own_lmra_assessment(uuid) is
  'True if the calling user is the employee who completed target_lmra_id (a.completed_by_employee_id). Backs lmra_hazards/lmra_participants write access for an ordinary worker''s own assessment, mirroring is_project_foreman()''s role in the same policies.';

revoke all on function public.is_own_lmra_assessment(uuid) from public, anon;
grant execute on function public.is_own_lmra_assessment(uuid) to authenticated;

-- INSERT: HSE Manager (unchanged) OR the project's own Foreman (unchanged)
-- OR — NEW — any employee with active standing on the project
-- (has_project_access), creating strictly for THEMSELVES
-- (is_own_employee(completed_by_employee_id)) — this is what opens creation
-- to ordinary eligible workers without ever letting them set
-- completed_by_employee_id to someone else (no impersonation path).
drop policy lmra_assessments_insert on public.lmra_assessments;
create policy lmra_assessments_insert
  on public.lmra_assessments
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and (
      public.has_company_role(company_id, 'hseq_manager')
      or public.is_project_foreman(project_id)
      or (public.has_project_access(project_id) and public.is_own_employee(completed_by_employee_id))
    )
  );

-- UPDATE: same three branches — an ordinary worker may edit their OWN
-- assessment's core fields (never hazards/participants once past draft —
-- that's assert_lmra_assessment_is_draft()'s job, unaffected by who the
-- actor is). completed_by_employee_id is now immutable (see
-- validate_lmra_assessment_update() above), so this self-branch can never
-- be used to "become" the owner of someone else's record after the fact.
drop policy lmra_assessments_update on public.lmra_assessments;
create policy lmra_assessments_update
  on public.lmra_assessments
  for update
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_company_role(company_id, 'hseq_manager')
      or public.is_project_foreman(project_id)
      or (public.has_project_access(project_id) and public.is_own_employee(completed_by_employee_id))
    )
  )
  with check (
    public.is_company_member(company_id)
    and (
      public.has_company_role(company_id, 'hseq_manager')
      or public.is_project_foreman(project_id)
      or (public.has_project_access(project_id) and public.is_own_employee(completed_by_employee_id))
    )
  );

drop policy lmra_hazards_write on public.lmra_hazards;
create policy lmra_hazards_write
  on public.lmra_hazards
  for update
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_company_role(company_id, 'hseq_manager')
      or exists (select 1 from public.lmra_assessments a where a.id = lmra_hazards.lmra_assessment_id and public.is_project_foreman(a.project_id))
      or public.is_own_lmra_assessment(lmra_hazards.lmra_assessment_id)
    )
  )
  with check (
    public.is_company_member(company_id)
    and (
      public.has_company_role(company_id, 'hseq_manager')
      or exists (select 1 from public.lmra_assessments a where a.id = lmra_hazards.lmra_assessment_id and public.is_project_foreman(a.project_id))
      or public.is_own_lmra_assessment(lmra_hazards.lmra_assessment_id)
    )
  );

drop policy lmra_participants_insert on public.lmra_participants;
create policy lmra_participants_insert
  on public.lmra_participants
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and (
      public.has_company_role(company_id, 'hseq_manager')
      or exists (select 1 from public.lmra_assessments a where a.id = lmra_participants.lmra_assessment_id and public.is_project_foreman(a.project_id))
      or public.is_own_lmra_assessment(lmra_participants.lmra_assessment_id)
    )
  );

drop policy lmra_participants_delete on public.lmra_participants;
create policy lmra_participants_delete
  on public.lmra_participants
  for delete
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_company_role(company_id, 'hseq_manager')
      or exists (select 1 from public.lmra_assessments a where a.id = lmra_participants.lmra_assessment_id and public.is_project_foreman(a.project_id))
      or public.is_own_lmra_assessment(lmra_participants.lmra_assessment_id)
    )
  );

-- lmra_assessments_select/lmra_hazards_select/lmra_participants_select are
-- UNCHANGED — has_project_access(project_id) already grants any project-
-- rostered employee (any role, including a plain worker) read access; no
-- broadening needed there.

-- ============================================================================
-- 7) Atomic create/update RPCs (Phase 7 — one complete save flow)
-- ============================================================================
-- Replaces the old fragmented insert-then-save-hazards-then-save-
-- participants-then-separately-submit flow with ONE call per action.
-- SECURITY INVOKER — every underlying write still goes through the RLS/
-- triggers above exactly as individual statements would; this adds
-- atomicity only, never elevation. target_submit=false is the optional
-- "Save Draft" path (status stays 'draft', no go/no-go confirmation
-- required); target_submit=true records the go/no-go decision and moves
-- straight to 'submitted' with submitted_by/submitted_at set, folding what
-- used to be a separate submit step into the same one-shot save per this
-- milestone's Phase 6/7 explicit "final confirmation on the same form"
-- requirement.
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
  target_stop_work_reason text default null
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
    completed_by_employee_id, responsible_person_id, notes, created_by, updated_by
  ) values (
    target_company_id, target_project_id, target_work_area, target_work_activity, target_work_date, target_shift,
    target_completed_by_employee_id, target_responsible_person_id, target_notes, auth.uid(), auth.uid()
  )
  returning * into v_assessment;

  -- create_initial_lmra_hazards() has already pre-seeded the 12 fixed rows —
  -- bulk-update them from the incoming checklist in one statement.
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

comment on function public.create_lmra_assessment(uuid, uuid, text, text, date, public.lmra_shift, uuid, uuid, text, uuid[], jsonb, boolean, public.lmra_result, text) is
  'The one-shot "Save LMRA" / "Save Draft" create path (modules/lmra/actions.ts) — creates the assessment, bulk-updates its pre-seeded 12 hazard rows, inserts participants (deduplicated), and optionally moves straight to submitted with the go/no-go decision, all in one transaction. RLS/triggers on every underlying table are the real gate (SECURITY INVOKER) — this adds atomicity, not elevation.';

revoke all on function public.create_lmra_assessment(uuid, uuid, text, text, date, public.lmra_shift, uuid, uuid, text, uuid[], jsonb, boolean, public.lmra_result, text) from public, anon;
grant execute on function public.create_lmra_assessment(uuid, uuid, text, text, date, public.lmra_shift, uuid, uuid, text, uuid[], jsonb, boolean, public.lmra_result, text) to authenticated;

-- Edit path — core fields always; hazards/participants only while still
-- draft (silently left untouched otherwise, matching the UI which never
-- lets a non-draft record submit changes to those sections in the first
-- place — assert_lmra_assessment_is_draft() would reject them anyway, this
-- just avoids surfacing that as a raw DB error for a section the caller
-- never had a chance to edit).
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
  'The one-shot edit path (modules/lmra/actions.ts) — updates core fields always; hazards/participants only while the assessment is still a draft (silently skipped otherwise, matching the read-only UI for a submitted/approved/rejected record). RLS/triggers are the real gate (SECURITY INVOKER).';

revoke all on function public.update_lmra_assessment(uuid, text, text, date, public.lmra_shift, uuid, text, uuid[], jsonb) from public, anon;
grant execute on function public.update_lmra_assessment(uuid, text, text, date, public.lmra_shift, uuid, text, uuid[], jsonb) to authenticated;
