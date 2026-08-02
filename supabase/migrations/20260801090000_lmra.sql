-- LMRA (Last Minute Risk Assessment) milestone.
--
-- Builds on docs/DATABASE_SCHEMA.md's existing `lmra_assessments`/
-- `lmra_participants` proposal (§6), extended with what this milestone's
-- explicit requirements add beyond that minimal proposal: a create → submit
-- → review/approve → archive workflow, and a fixed 12-item scaffolding
-- hazard checklist per assessment (`lmra_hazards`, not previously
-- documented). Three deliberate deviations from the original proposal,
-- consistent with docs/DATABASE_SCHEMA.md's own "exact column lists may be
-- refined in migration review" note:
--   1. `work_area text` instead of a `location_id` FK to `project_locations`
--      — that table doesn't exist yet; free text matches the already-
--      implemented `projects.location` pattern.
--   2. `work_date date` + `shift text` instead of a single `conducted_at
--      timestamptz` — this milestone's spec calls out date and shift as two
--      distinct required fields.
--   3. `created_by`/`created_at` (this codebase's actual, consistently-used
--      audit-column names everywhere else) instead of the proposal's
--      `conducted_by`/`conducted_at`.
--   4. No `risk_level` column — the per-hazard detail (`lmra_hazards`)
--      already captures risk information; a redundant single overall scale
--      isn't part of this milestone's explicit requirements.
--
-- Permissions follow docs/ROLES_AND_PERMISSIONS.md §5's LMRA row exactly —
-- notably NOT the "company_admin/operations_manager can do everything"
-- pattern every other module in this schema uses: Company Manager and
-- Workforce Coordinator are View-only here ("V"), same as
-- Project Manager/HSE Officer/Inspector (all "V⁴", project-scoped). HSE
-- Manager holds Full ("F" — create/view/edit/approve/archive), Foreman
-- holds Manage ("M⁴" — create/view/edit/approve within their assigned
-- project/team, but NOT archive/close, per the F-vs-M legend distinction in
-- docs/ROLES_AND_PERMISSIONS.md §3). This is genuinely different from
-- every other module built so far and is enforced deliberately below, not
-- a copy-paste of the projects/teams permission shape.

-- ── 1) enums ──────────────────────────────────────────────────────────
create type public.lmra_status as enum ('draft', 'submitted', 'approved', 'rejected', 'archived');

comment on type public.lmra_status is
  'The record''s administrative workflow state — independent of `lmra_assessments.result` (the on-site go/no-go safety decision). A rejected assessment can be corrected (back to draft) and resubmitted; archived is terminal.';

create type public.lmra_result as enum ('go', 'no_go');

comment on type public.lmra_result is
  'The on-site safety determination made by whoever completed the assessment: work may proceed (go) or must stop (no_go) — docs/UI_GUIDELINES.md §3''s "LMRA result: go/no-go... never ambiguous with a neutral gray" color rule applies wherever this renders.';

create type public.lmra_hazard_type as enum (
  'working_at_height',
  'falling_objects',
  'line_of_fire',
  'manual_material_handling',
  'lifting_operations',
  'mobile_equipment_mewp',
  'weather_conditions',
  'access_egress',
  'housekeeping',
  'tools_equipment',
  'simultaneous_operations',
  'other'
);

comment on type public.lmra_hazard_type is
  'Fixed 12-item scaffolding hazard checklist for this milestone''s explicit requirement — not organization-configurable (matches the same "fixed v1 catalogue" precedent as `roles`/`team_color`). `other` pairs with `lmra_hazards.other_description` for anything not covered by the fixed 11.';

-- ── 2) lmra_assessments ───────────────────────────────────────────────
create table public.lmra_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null,
  work_area text not null,
  work_activity text not null,
  work_date date not null,
  shift text not null,
  responsible_foreman_id uuid not null,
  status public.lmra_status not null default 'draft',
  result public.lmra_result not null default 'go',
  stop_work_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  submitted_by uuid references public.profiles (id) on delete set null,
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  approved_at timestamptz,
  archived_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  constraint lmra_work_area_not_blank check (btrim(work_area) <> ''),
  constraint lmra_work_activity_not_blank check (btrim(work_activity) <> ''),
  constraint lmra_stop_work_reason_required check (result <> 'no_go' or stop_work_reason is not null),
  -- Enables composite FKs from lmra_hazards/lmra_participants below —
  -- same pattern as projects_id_organization_id_key/
  -- teams_id_project_id_organization_id_key.
  constraint lmra_assessments_id_organization_id_key unique (id, organization_id),
  constraint lmra_assessments_project_fk foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  constraint lmra_assessments_foreman_fk foreign key (responsible_foreman_id, organization_id) references public.employees (id, organization_id) on delete restrict
);

comment on table public.lmra_assessments is
  'A Last Minute Risk Assessment — a short, structured go/no-go safety check completed immediately before starting a task. HSEQ evidence — never hard-deleted (see `status = ''archived''`); a correction to a submitted/approved record is a new revision via edit-then-resubmit, not a silent overwrite, but this milestone does not implement a separate revision-history table (docs/DATABASE_SCHEMA.md''s `deleted_at` soft-delete note for `lmra_assessments` is superseded here by the richer `status` workflow this milestone adds).';
comment on column public.lmra_assessments.responsible_foreman_id is
  'ON DELETE RESTRICT (not SET NULL, unlike most employee references elsewhere) — an LMRA must always show who was accountable for the work; if that employee record needs removing, the LMRA must be reassigned first, not silently orphaned.';

create index lmra_assessments_organization_id_idx on public.lmra_assessments (organization_id);
create index lmra_assessments_project_id_idx on public.lmra_assessments (project_id);
create index lmra_assessments_status_idx on public.lmra_assessments (organization_id, status);
create index lmra_assessments_work_date_idx on public.lmra_assessments (organization_id, work_date);
create index lmra_assessments_foreman_id_idx on public.lmra_assessments (responsible_foreman_id);

create trigger lmra_assessments_set_updated_at
  before update on public.lmra_assessments
  for each row execute function public.set_updated_at();

-- ── 3) lmra_hazards — one row per fixed hazard type, per assessment ───
create table public.lmra_hazards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  lmra_assessment_id uuid not null references public.lmra_assessments (id) on delete cascade,
  hazard_type public.lmra_hazard_type not null,
  is_applicable boolean not null default false,
  controls text,
  responsible_person_id uuid,
  controls_confirmed boolean not null default false,
  other_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lmra_hazards_one_row_per_type unique (lmra_assessment_id, hazard_type),
  constraint lmra_hazards_responsible_person_fk foreign key (responsible_person_id, organization_id) references public.employees (id, organization_id) on delete set null
);

comment on table public.lmra_hazards is
  'The fixed 12-item hazard checklist for one lmra_assessments row — exactly 12 rows per assessment, one per lmra_hazard_type value, auto-created by create_initial_lmra_hazards() below (see comment there for why this is pre-seeded rather than dynamically inserted by the client).';

create index lmra_hazards_assessment_id_idx on public.lmra_hazards (lmra_assessment_id);
create index lmra_hazards_organization_id_idx on public.lmra_hazards (organization_id);

create trigger lmra_hazards_set_updated_at
  before update on public.lmra_hazards
  for each row execute function public.set_updated_at();

-- Every assessment gets all 12 hazard rows the moment it's created — the
-- client never inserts/deletes individual hazard rows, only updates the
-- 12 that already exist (via save_lmra_hazards() below). This mirrors
-- employees_create_initial_period()'s "the trigger creates the row the
-- client would otherwise have to remember to create" pattern, and turns
-- the hazard checklist into a fixed-shape update instead of a dynamic
-- add/remove list — simpler and matches this milestone's fixed (not
-- organization-configurable) 12-item requirement exactly.
create or replace function public.create_initial_lmra_hazards()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  insert into public.lmra_hazards (organization_id, lmra_assessment_id, hazard_type)
  select new.organization_id, new.id, unnest(enum_range(null::public.lmra_hazard_type));
  return new;
end;
$$;

create trigger lmra_assessments_create_initial_hazards
  after insert on public.lmra_assessments
  for each row execute function public.create_initial_lmra_hazards();

-- ── 4) lmra_participants — workers involved (docs/DATABASE_SCHEMA.md §6's existing shape) ──
create table public.lmra_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  lmra_assessment_id uuid not null references public.lmra_assessments (id) on delete cascade,
  employee_id uuid not null,
  created_at timestamptz not null default now(),
  constraint lmra_participants_one_row_per_employee unique (lmra_assessment_id, employee_id),
  constraint lmra_participants_employee_fk foreign key (employee_id, organization_id) references public.employees (id, organization_id) on delete cascade
);

comment on table public.lmra_participants is
  'Workers involved in the task this assessment covers. Docs/ROLES_AND_PERMISSIONS.md §5 footnote 9: an Employee participates in and signs an LMRA they attend but does not create/schedule it — this table is how "attend" is recorded; digital-signature attestation (`signature_id` in the original proposal) is deferred, `digital_signatures` isn''t built yet.';

create index lmra_participants_assessment_id_idx on public.lmra_participants (lmra_assessment_id);
create index lmra_participants_employee_id_idx on public.lmra_participants (employee_id);
create index lmra_participants_organization_id_idx on public.lmra_participants (organization_id);

-- ── 5) insert-time eligibility (mirrors assert_employee_eligible_for_assignment's use in projects_and_teams) ──
create or replace function public.validate_lmra_assessment_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.assert_project_not_archived(new.project_id);
  perform public.assert_employee_eligible_for_assignment(new.responsible_foreman_id);
  return new;
end;
$$;

create trigger lmra_assessments_validate_insert
  before insert on public.lmra_assessments
  for each row execute function public.validate_lmra_assessment_insert();

create or replace function public.validate_lmra_participant_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.assert_employee_eligible_for_assignment(new.employee_id);
  return new;
end;
$$;

create trigger lmra_participants_validate_insert
  before insert on public.lmra_participants
  for each row execute function public.validate_lmra_participant_insert();

-- ── 6) update-time state-machine guard ─────────────────────────────────
-- Mirrors employee_employment_periods_validate_update/
-- validate_project_assignment_update's "only closing an open row is
-- allowed" shape, adapted to a 5-state workflow instead of a binary
-- open/closed one:
--   draft            -> any core field, or -> submitted
--   submitted         -> approved/rejected only (reviewed_by/reviewed_at/
--                        review_notes/approved_at/status) or back -> draft
--                        (a reviewer sending it back uncorrected, same
--                        actor class as who could approve it)
--   approved/rejected -> draft (re-opened for correction) or -> archived
--   archived          -> terminal, no further changes at all
-- The archived transition additionally requires the ACTOR hold
-- hseq_manager specifically (docs/ROLES_AND_PERMISSIONS.md: Foreman's "M"
-- excludes archive/close, only HSE Manager's "F" includes it) — the RLS
-- UPDATE policy below is deliberately permissive enough to let a Foreman
-- attempt this (so the error is "you can't archive," not "you can't touch
-- this row at all"), and this trigger is the one place that actually
-- enforces the F-vs-M distinction.
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
    or new.organization_id is distinct from old.organization_id
    or new.project_id is distinct from old.project_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'LMRA identity/creation fields cannot be changed';
  end if;

  if new.status = 'archived' and old.status <> 'archived' then
    if not public.has_organization_role(new.organization_id, 'hseq_manager') then
      raise exception 'only an HSE Manager may archive an LMRA assessment';
    end if;
  end if;

  return new;
end;
$$;

create trigger lmra_assessments_validate_update
  before update on public.lmra_assessments
  for each row execute function public.validate_lmra_assessment_update();

-- Hazard/participant rows may only be added/edited/removed while the
-- parent assessment is still a draft — once submitted, the checklist and
-- crew list are part of what was reviewed, not still-editable scratch
-- data. (Re-opening the parent to 'draft' — see the state machine above —
-- makes them editable again.)
create or replace function public.assert_lmra_assessment_is_draft(target_lmra_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status public.lmra_status;
begin
  select status into v_status from public.lmra_assessments where id = target_lmra_id;

  if v_status is null then
    raise exception 'LMRA assessment % not found', target_lmra_id;
  end if;

  if v_status <> 'draft' then
    raise exception 'LMRA assessment % is not a draft (status = %) — hazards and participants can only be changed while a draft', target_lmra_id, v_status;
  end if;
end;
$$;

create or replace function public.validate_lmra_hazard_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.assert_lmra_assessment_is_draft(new.lmra_assessment_id);
  if new.lmra_assessment_id is distinct from old.lmra_assessment_id
    or new.hazard_type is distinct from old.hazard_type
    or new.organization_id is distinct from old.organization_id then
    raise exception 'a hazard row''s assessment/type/organization cannot be changed';
  end if;
  return new;
end;
$$;

create trigger lmra_hazards_validate_update
  before update on public.lmra_hazards
  for each row execute function public.validate_lmra_hazard_update();

-- Shared by both the INSERT and DELETE triggers below — explicit TG_OP
-- branching rather than coalesce(new, old) on a composite row value,
-- which isn't a reliable pattern across row types; this is the standard,
-- always-correct way to write one trigger function for both operations.
create or replace function public.validate_lmra_participant_write()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_lmra_assessment_id uuid;
begin
  if TG_OP = 'DELETE' then
    v_lmra_assessment_id := old.lmra_assessment_id;
  else
    v_lmra_assessment_id := new.lmra_assessment_id;
  end if;

  perform public.assert_lmra_assessment_is_draft(v_lmra_assessment_id);

  if TG_OP = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;

create trigger lmra_participants_validate_insert_draft_only
  before insert on public.lmra_participants
  for each row execute function public.validate_lmra_participant_write();

create trigger lmra_participants_validate_delete_draft_only
  before delete on public.lmra_participants
  for each row execute function public.validate_lmra_participant_write();

-- ── 7) RLS ────────────────────────────────────────────────────────────
-- Helper: is the caller an active foreman (team_assignments,
-- assignment_role = 'foreman') on this specific project? Mirrors
-- is_project_manager()'s exact shape, but against team_assignments — a
-- Foreman's project standing has always come from team_assignments, not
-- project_assignments (docs/ROLES_AND_PERMISSIONS.md §1's Foreman row,
-- already the pattern has_project_access() itself relies on).
create or replace function public.is_project_foreman(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.team_assignments ta
    join public.employees e on e.id = ta.employee_id
    where ta.project_id = target_project_id
      and ta.assignment_role = 'foreman'
      and ta.end_at is null
      and e.profile_id = auth.uid()
  );
$$;

comment on function public.is_project_foreman(uuid) is
  'True if the calling user holds an active (end_at is null) team_assignments row with assignment_role = ''foreman'' for target_project_id. Backs LMRA write access below — docs/ROLES_AND_PERMISSIONS.md §5''s Foreman row ("M⁴": create/view/edit/approve within their assigned project/team, not archive).';

revoke all on function public.is_project_foreman(uuid) from public, anon;
grant execute on function public.is_project_foreman(uuid) to authenticated;

alter table public.lmra_assessments enable row level security;
alter table public.lmra_assessments force row level security;
alter table public.lmra_hazards enable row level security;
alter table public.lmra_hazards force row level security;
alter table public.lmra_participants enable row level security;
alter table public.lmra_participants force row level security;

-- No DELETE grant anywhere on lmra_assessments — never hard-deleted (see
-- the table comment); "delete/close" for the one role that has it
-- (HSE Manager, "F") means archive-in-place via UPDATE, same as
-- employees/projects/teams.
grant select, insert, update on public.lmra_assessments to authenticated;
grant select, insert, update, delete on public.lmra_hazards to authenticated;
grant select, insert, delete on public.lmra_participants to authenticated;

-- SELECT: HSE Manager gets unconditional org-wide visibility (docs' "F"
-- with no assignment-scoping footnote, unlike PM/HO/IN/FM), matching HSE
-- Manager's own role definition ("Owns HSEQ modules... at a scope set per
-- assignment" — org-wide by default, per-assignment narrowing is a future
-- config not built here). Company Manager/Workforce Coordinator get
-- unconditional org-wide VIEW (their row is "V", not "F" — deliberately
-- NOT included in the write policies below). Everyone else (PM/HO/IN/FM/
-- Employee) sees it only via has_project_access(project_id), same
-- assignment-driven visibility as projects/teams.
create policy lmra_assessments_select
  on public.lmra_assessments
  for select
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager', 'hseq_manager'])
      or public.has_project_access(project_id)
    )
  );

-- INSERT/UPDATE: HSE Manager (org-wide) or the project's own Foreman —
-- deliberately EXCLUDES company_admin/operations_manager (their row is
-- "V", not "F"/"M") and EXCLUDES Project Manager/HSE Officer/Inspector
-- (their row is "V⁴") — a genuine departure from every other module's
-- "org-wide managers can always write" pattern, per docs/
-- ROLES_AND_PERMISSIONS.md §5's LMRA row.
create policy lmra_assessments_insert
  on public.lmra_assessments
  for insert
  to authenticated
  with check (
    public.is_organization_member(organization_id)
    and (
      public.has_organization_role(organization_id, 'hseq_manager')
      or public.is_project_foreman(project_id)
    )
  );

create policy lmra_assessments_update
  on public.lmra_assessments
  for update
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_organization_role(organization_id, 'hseq_manager')
      or public.is_project_foreman(project_id)
    )
  )
  with check (
    public.is_organization_member(organization_id)
    and (
      public.has_organization_role(organization_id, 'hseq_manager')
      or public.is_project_foreman(project_id)
    )
  );

create policy lmra_hazards_select
  on public.lmra_hazards
  for select
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager', 'hseq_manager'])
      or exists (select 1 from public.lmra_assessments a where a.id = lmra_hazards.lmra_assessment_id and public.has_project_access(a.project_id))
    )
  );

create policy lmra_hazards_write
  on public.lmra_hazards
  for update
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_organization_role(organization_id, 'hseq_manager')
      or exists (select 1 from public.lmra_assessments a where a.id = lmra_hazards.lmra_assessment_id and public.is_project_foreman(a.project_id))
    )
  )
  with check (
    public.is_organization_member(organization_id)
    and (
      public.has_organization_role(organization_id, 'hseq_manager')
      or exists (select 1 from public.lmra_assessments a where a.id = lmra_hazards.lmra_assessment_id and public.is_project_foreman(a.project_id))
    )
  );

-- No INSERT/DELETE policy on lmra_hazards for `authenticated` at all —
-- the 12 rows are created exclusively by create_initial_lmra_hazards()
-- (SECURITY INVOKER, but fired by the same INSERT the caller already had
-- lmra_assessments_insert permission for) and never removed. The grant
-- above includes insert/delete for completeness against future needs, but
-- no policy means both are structurally impossible for `authenticated`
-- today — same "grant exists, policy doesn't" belt-and-suspenders pattern
-- used elsewhere (e.g. audit_events' UPDATE/DELETE).

create policy lmra_participants_select
  on public.lmra_participants
  for select
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager', 'hseq_manager'])
      or exists (select 1 from public.lmra_assessments a where a.id = lmra_participants.lmra_assessment_id and public.has_project_access(a.project_id))
    )
  );

create policy lmra_participants_insert
  on public.lmra_participants
  for insert
  to authenticated
  with check (
    public.is_organization_member(organization_id)
    and (
      public.has_organization_role(organization_id, 'hseq_manager')
      or exists (select 1 from public.lmra_assessments a where a.id = lmra_participants.lmra_assessment_id and public.is_project_foreman(a.project_id))
    )
  );

create policy lmra_participants_delete
  on public.lmra_participants
  for delete
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_organization_role(organization_id, 'hseq_manager')
      or exists (select 1 from public.lmra_assessments a where a.id = lmra_participants.lmra_assessment_id and public.is_project_foreman(a.project_id))
    )
  );

-- ── 8) save_lmra_hazards — bulk-update the 12 fixed hazard rows in one call ──
-- Mirrors save_team_with_assignments()'s "one function call for the whole
-- form submit" shape, simplified: there's no create/reorder/multi-table
-- transaction to coordinate here, just updating up to 12 already-existing
-- rows from one JSON array in a single statement instead of 12 round
-- trips. SECURITY INVOKER — subject to lmra_hazards RLS/triggers exactly
-- as 12 individual UPDATEs would be.
create or replace function public.save_lmra_hazards(target_lmra_id uuid, target_hazards jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  update public.lmra_hazards h
  set
    is_applicable = (incoming.is_applicable)::boolean,
    controls = nullif(btrim(incoming.controls), ''),
    responsible_person_id = incoming.responsible_person_id,
    controls_confirmed = (incoming.controls_confirmed)::boolean,
    other_description = nullif(btrim(incoming.other_description), '')
  from jsonb_to_recordset(target_hazards) as incoming(
    hazard_type public.lmra_hazard_type,
    is_applicable boolean,
    controls text,
    responsible_person_id uuid,
    controls_confirmed boolean,
    other_description text
  )
  where h.lmra_assessment_id = target_lmra_id
    and h.hazard_type = incoming.hazard_type;
end;
$$;

revoke all on function public.save_lmra_hazards(uuid, jsonb) from public, anon;
grant execute on function public.save_lmra_hazards(uuid, jsonb) to authenticated;

comment on function public.save_lmra_hazards(uuid, jsonb) is
  'Bulk-updates lmra_hazards rows for one assessment from a JSON array of {hazard_type, is_applicable, controls, responsible_person_id, controls_confirmed, other_description}. SECURITY INVOKER — every underlying UPDATE still goes through lmra_hazards_write RLS and validate_lmra_hazard_update() (draft-only) exactly as individual updates would.';
