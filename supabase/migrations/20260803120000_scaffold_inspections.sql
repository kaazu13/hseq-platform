-- Scaffold Inspections milestone.
--
-- Builds on docs/DATABASE_SCHEMA.md's `scaffold_inspections`/
-- `scaffold_inspection_items` proposal (§6), substantially extended per
-- this milestone's explicit requirements — most significantly, the
-- proposal had no dedicated "scaffold" register at all (one row per
-- inspection, `tag_status` living directly on it). This milestone's
-- requirements describe a real PHYSICAL REGISTER (the scaffold structure
-- itself — tag number, type, load class, height, erection details) that
-- PERSISTS across many inspections over its lifetime, so this migration
-- adds a dedicated `scaffolds` table the proposal didn't have, with
-- `scaffold_inspections` (one row per inspection EVENT) referencing it —
-- the same "long-lived entity + its individual dated records" shape
-- `employees`/`employee_employment_periods` already established.
--
-- Four tables:
--   1. `scaffolds` — the physical register. `status` is a DENORMALIZED
--      SNAPSHOT column, kept in sync by a SECURITY DEFINER trigger
--      whenever an inspection for it is finalized — same precedent as
--      `employees.employment_status` (sync_employee_employment_snapshot(),
--      20260727090000_employment_periods.sql §5) — column-locked so only
--      that trigger can write it (§7 there).
--   2. `scaffold_inspections` — one row per inspection EVENT. `status`
--      (draft/finalized) is the workflow state; `outcome` (safe_for_use/
--      safe_with_restrictions/unsafe_do_not_use/awaiting_corrective_action/
--      closed_dismantled) is the safety determination, set at
--      finalization — same draft-workflow-state vs. safety-determination
--      split LMRA already uses (`status` vs. `result`).
--   3. `scaffold_inspection_items` — the fixed 24-item checklist, one row
--      per item per inspection, auto-seeded by a trigger the moment the
--      inspection is created — same "trigger creates the child rows the
--      client would otherwise have to remember to create" shape as
--      `lmra_hazards`/`create_initial_lmra_hazards()`.
--   4. `scaffold_defects` — a remediation item an inspection (or one of
--      its checklist rows) raises. Deliberately its OWN table, not a
--      polymorphic reuse of `corrective_actions` — matches this
--      codebase's established "no polymorphic source_id; each HSEQ module
--      owns its own defect/action table" choice already made for
--      `corrective_actions` itself (see that migration's header comment),
--      even though the shape closely mirrors it. Column names follow this
--      milestone's exact field list (`immediate_control`,
--      `verification_notes`, `verified_by`/`verified_at`, distinct from
--      `corrective_actions`' `closure_evidence`/`reviewed_by`/`reviewed_at`
--      naming).
--
-- Corrections to a FINALIZED inspection are never in-place edits — a
-- correction is a new linked `scaffold_inspections` row
-- (`corrects_inspection_id`), and finalizing it sets `superseded_by_id`
-- on the ORIGINAL — the only write ever made to an already-finalized row,
-- and only that one forward-pointer column, never its outcome/checklist/
-- inspector data. This is the exact "correction of a finalized record is
-- a new linked record/amendment, not an edit" principle
-- docs/DATABASE_SCHEMA.md's soft-delete section already states for every
-- HSEQ evidence table.
--
-- Inspection validity is CONFIGURABLE, resolved project → organization →
-- a documented system default (7 days — see the ALTER TABLE comments and
-- `resolve_scaffold_inspection_validity_days()` below for why 7 was
-- chosen). The resolved period is applied ONCE, at finalization time, to
-- compute `expires_at` — a real stored snapshot (so a later config change
-- never retroactively rewrites a past inspection's expiry), while
-- "is this currently expired" is ALWAYS derived by comparing `expires_at`
-- to now (this milestone's explicit "do not manually store an arbitrary
-- overdue flag" instruction) — same split as `corrective_actions.due_date`
-- (stored) vs. `isCorrectiveActionOverdue()` (derived).
--
-- Permissions follow docs/ROLES_AND_PERMISSIONS.md §5's Scaffold
-- Inspections row exactly: — | V | V | V⁴ | F | M⁴ | V⁴ | M⁴ | — | — | V⁴
-- (PSA|CM|WC|PM|HM|HO|FM|IN|RC|PL|EM). HSE Manager is unrestricted
-- org-wide ("F"). HSE Officer AND Inspector both get "M⁴" (project-scoped
-- manage — create/edit/finalize within their assigned project). Notably
-- Foreman is "V⁴" here — VIEW ONLY, a genuine departure from LMRA (where
-- Foreman manages every record on their project) and from Safety
-- Observations (where Foreman can create/edit their own) — scaffold
-- inspection is a specialist-inspector function in this schema, not a
-- foreman one. Project Manager and Employee are also "V⁴". A defect's
-- RESPONSIBLE PERSON can still progress THEIR OWN assigned defect
-- regardless of role (mirrors `corrective_actions`' Employee-assignee
-- carve-out) — this is how a Foreman who's responsible for fixing
-- something still gets to act on it, without contradicting their
-- otherwise-view-only standing on the module.

-- ── 1) enums ──────────────────────────────────────────────────────────
create type public.scaffold_type as enum (
  'independent',
  'birdcage',
  'mobile',
  'suspended',
  'cantilever',
  'access_tower',
  'loading_bay',
  'temporary_roof',
  'other'
);

create type public.scaffold_status as enum (
  'pending_inspection',
  'safe',
  'restricted',
  'awaiting_corrective_action',
  'unsafe',
  'closed'
);

comment on type public.scaffold_status is
  'Denormalized snapshot of the scaffold''s CURRENT usability, synced from its latest finalized inspection by sync_scaffold_status_snapshot() — never written directly (see the column-privilege lockdown below). `pending_inspection` is the true default: a newly registered scaffold has no finalized inspection yet and is not yet cleared for use. "Expiring soon"/"Expired" are deliberately NOT values here — they are time-derived overlays computed from the current inspection''s `expires_at`, never stored (this milestone''s explicit "do not manually store an arbitrary overdue flag" instruction) — see modules/scaffolds/types.ts''s getScaffoldDisplayStatus().';

create type public.scaffold_inspection_status as enum ('draft', 'finalized');

comment on type public.scaffold_inspection_status is
  'Workflow state, independent of `outcome` (the safety determination) — same split as lmra_assessments.status vs. .result. A finalized inspection is immutable except for the one narrow correction-linkage exception validate_scaffold_inspection_update() allows — see this migration''s header comment.';

create type public.scaffold_inspection_outcome as enum (
  'safe_for_use',
  'safe_with_restrictions',
  'unsafe_do_not_use',
  'awaiting_corrective_action',
  'closed_dismantled'
);

create type public.scaffold_inspection_reason as enum (
  'initial_handover',
  'routine_inspection',
  'after_modification',
  'after_severe_weather',
  'after_impact_incident',
  'after_relocation',
  'reinspection_following_defects',
  'other'
);

create type public.scaffold_inspection_item_type as enum (
  'foundation_sole_boards',
  'base_plates_adjustable_bases',
  'standards',
  'ledgers',
  'transoms',
  'bracing',
  'ties_anchors',
  'platforms_decking',
  'guardrails',
  'midrails',
  'toe_boards',
  'access_ladders_stairways',
  'access_gates',
  'loading_bays',
  'sheet_netting_condition',
  'falling_object_controls',
  'scaffold_tag_signage',
  'housekeeping',
  'maximum_load_information',
  'electrical_clearance',
  'vehicle_mobile_equipment_protection',
  'unauthorized_alterations',
  'overall_stability',
  'other_identified_issue'
);

comment on type public.scaffold_inspection_item_type is
  'Fixed 24-item scaffold safety checklist for this milestone''s explicit requirement — not organization-configurable, same "fixed v1 catalogue" precedent as lmra_hazard_type/observation_category.';

create type public.scaffold_inspection_item_result as enum ('acceptable', 'defect_found', 'not_applicable');

create type public.scaffold_defect_severity as enum ('low', 'medium', 'high', 'critical');

comment on type public.scaffold_defect_severity is
  'Same 4-level naming convention as observation_risk_level, for consistency. "Critical" is the severity validate_scaffold_inspection_finalize() below checks: an inspection with any unresolved defect at all (any severity) cannot finalize as safe_for_use — see this migration''s header comment; critical is called out explicitly in the milestone requirements as the clearest case of that same general rule.';

create type public.scaffold_defect_status as enum ('open', 'in_progress', 'awaiting_verification', 'closed', 'rejected');

comment on type public.scaffold_defect_status is
  'Same 5-state shape as corrective_action_status, and the same update-guard discipline (see validate_scaffold_defect_update() below) — including two fixes already learned the hard way on corrective_actions and applied here from the start: "leaving closed/rejected" is recognized for ANY destination status, not just specifically ''open''; and reject/reopen reasons must be FRESHLY supplied (new.reopen_reason IS DISTINCT FROM old.reopen_reason), not merely non-empty, so a stale reason can''t be silently reused across cycles.';

-- ── 2) configurable inspection validity — project → organization → system default ──
-- Nullable on both: null means "no override configured at this level,
-- fall through to the next." Neither existing table had any settings/
-- configuration column before this (confirmed by inspection of every
-- prior migration) — these are the first. A dedicated settings table was
-- considered and rejected as premature for a single integer setting; if a
-- second configurable value is ever needed, that's the point to
-- introduce one and migrate these two columns into it.
alter table public.organizations add column scaffold_inspection_validity_days integer;
alter table public.projects add column scaffold_inspection_validity_days integer;

comment on column public.organizations.scaffold_inspection_validity_days is
  'Org-wide default scaffold re-inspection interval in days, used when a project has no override of its own. Null = no org-level override; falls through to the documented system default (7 days) — see resolve_scaffold_inspection_validity_days() below.';
comment on column public.projects.scaffold_inspection_validity_days is
  'Project-level scaffold re-inspection interval in days — takes priority over the organization''s value when set. Null = no project-level override; falls through to the organization''s value, then the system default.';

alter table public.organizations add constraint organizations_scaffold_inspection_validity_days_positive check (scaffold_inspection_validity_days is null or scaffold_inspection_validity_days > 0);
alter table public.projects add constraint projects_scaffold_inspection_validity_days_positive check (scaffold_inspection_validity_days is null or scaffold_inspection_validity_days > 0);

-- SYSTEM DEFAULT: 7 days. Documented explicitly per this milestone's "do
-- not silently hard-code business rules without documenting them"
-- instruction: seven days (weekly re-inspection) is the interval named in
-- widely-used scaffold safety guidance (e.g. HSE/TG20-style "at least
-- every 7 days, and after any event likely to affect stability") as a
-- common baseline where no stricter local/organizational policy applies.
-- This is a starting default for this platform, not a claim of regulatory
-- authority for any specific jurisdiction — an organization or project
-- should set its own value above whenever a different interval applies to
-- them.
create or replace function public.resolve_scaffold_inspection_validity_days(target_project_id uuid)
returns integer
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.scaffold_inspection_validity_days from public.projects p where p.id = target_project_id),
    (select o.scaffold_inspection_validity_days from public.projects p join public.organizations o on o.id = p.organization_id where p.id = target_project_id),
    7
  );
$$;

comment on function public.resolve_scaffold_inspection_validity_days(uuid) is
  'Project override -> organization override -> documented system default (7 days). The single source of truth for "how long is a scaffold inspection valid" — called by finalize_scaffold_inspection() below when computing expires_at, and exposed to the app (modules/scaffolds/queries.ts) for display purposes (e.g. showing the org/project what value is currently in effect before they finalize).';

revoke all on function public.resolve_scaffold_inspection_validity_days(uuid) from public, anon;
grant execute on function public.resolve_scaffold_inspection_validity_days(uuid) to authenticated;

-- ── 3) scaffolds — the physical register ───────────────────────────────
create table public.scaffolds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null,
  tag_number text not null,
  work_area text not null,
  structure_reference text,
  scaffold_type public.scaffold_type not null,
  intended_use text not null,
  max_load_class text not null,
  max_height_meters numeric(6, 2),
  erected_by text,
  responsible_foreman_id uuid not null,
  erected_at date,
  status public.scaffold_status not null default 'pending_inspection',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  constraint scaffolds_tag_number_not_blank check (btrim(tag_number) <> ''),
  constraint scaffolds_work_area_not_blank check (btrim(work_area) <> ''),
  constraint scaffolds_intended_use_not_blank check (btrim(intended_use) <> ''),
  constraint scaffolds_max_load_class_not_blank check (btrim(max_load_class) <> ''),
  constraint scaffolds_max_height_positive check (max_height_meters is null or max_height_meters > 0),
  -- "Unique scaffold identifier or tag number within the relevant
  -- project" — this milestone's explicit requirement.
  constraint scaffolds_project_tag_number_key unique (project_id, tag_number),
  -- Enables composite FKs from scaffold_inspections/scaffold_defects.
  constraint scaffolds_id_organization_id_key unique (id, organization_id),
  constraint scaffolds_project_fk foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  constraint scaffolds_responsible_foreman_fk foreign key (responsible_foreman_id, organization_id) references public.employees (id, organization_id) on delete restrict
);

comment on table public.scaffolds is
  'The physical scaffold register — one row per erected scaffold structure, persisting across its entire lifecycle and every inspection ever performed on it. HSEQ evidence — never hard-deleted (no DELETE grant at all); `status = ''closed''` (dismantled) is the terminal state, not a row removal.';
comment on column public.scaffolds.erected_by is
  'Free text, not a FK to `teams` or `employees` — scaffold erection is frequently performed by a specialist (sub)contractor crew this schema does not otherwise track as internal staff. `responsible_foreman_id` below is the accountable INTERNAL party, which does need a real FK.';
comment on column public.scaffolds.max_load_class is
  'Free text (e.g. "Light Duty 2.0 kN/m2", "225 kg/m2") rather than a fixed enum — load classification schemes and units vary by standard/region; this milestone''s requirement is to record "maximum permitted load or load class" as given, not to normalize it into a closed vocabulary.';
comment on column public.scaffolds.responsible_foreman_id is
  'ON DELETE RESTRICT (not SET NULL) — matches lmra_assessments.responsible_foreman_id/safety_observations.observer_id: a scaffold must always show who is accountable for it.';

create index scaffolds_organization_id_idx on public.scaffolds (organization_id);
create index scaffolds_project_id_idx on public.scaffolds (project_id);
create index scaffolds_status_idx on public.scaffolds (organization_id, status);
create index scaffolds_responsible_foreman_id_idx on public.scaffolds (responsible_foreman_id);

create trigger scaffolds_set_updated_at
  before update on public.scaffolds
  for each row execute function public.set_updated_at();

create or replace function public.validate_scaffold_insert()
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

create trigger scaffolds_validate_insert
  before insert on public.scaffolds
  for each row execute function public.validate_scaffold_insert();

create or replace function public.validate_scaffold_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.project_id is distinct from old.project_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'scaffold identity/creation fields cannot be changed';
  end if;

  if new.status is distinct from old.status then
    raise exception 'scaffolds.status is a synced snapshot from finalized inspections and cannot be set directly — see sync_scaffold_status_snapshot()';
  end if;

  return new;
end;
$$;

create trigger scaffolds_validate_update
  before update on public.scaffolds
  for each row execute function public.validate_scaffold_update();

-- ── 4) scaffold_inspections — one row per inspection event ────────────
create table public.scaffold_inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  scaffold_id uuid not null,
  -- Denormalized from the scaffold for RLS-policy simplicity/performance
  -- — same rationale as corrective_actions.project_id, kept in sync by
  -- sync_scaffold_inspection_project_id() below.
  project_id uuid not null,
  inspection_reason public.scaffold_inspection_reason not null,
  previous_inspection_id uuid,
  corrects_inspection_id uuid,
  correction_reason text,
  superseded_by_id uuid,
  inspector_id uuid not null,
  inspected_at timestamptz not null default now(),
  status public.scaffold_inspection_status not null default 'draft',
  outcome public.scaffold_inspection_outcome,
  restrictions_notes text,
  expires_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  finalized_at timestamptz,
  finalized_by uuid references public.profiles (id) on delete set null,
  constraint scaffold_inspections_restrictions_required check (outcome <> 'safe_with_restrictions' or (restrictions_notes is not null and btrim(restrictions_notes) <> '')),
  constraint scaffold_inspections_correction_reason_required check (corrects_inspection_id is null or (correction_reason is not null and btrim(correction_reason) <> '')),
  -- Enables composite FKs from scaffold_inspection_items/scaffold_defects.
  constraint scaffold_inspections_id_organization_id_key unique (id, organization_id),
  constraint scaffold_inspections_scaffold_fk foreign key (scaffold_id, organization_id) references public.scaffolds (id, organization_id) on delete cascade,
  constraint scaffold_inspections_project_fk foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  constraint scaffold_inspections_inspector_fk foreign key (inspector_id, organization_id) references public.employees (id, organization_id) on delete restrict,
  constraint scaffold_inspections_previous_fk foreign key (previous_inspection_id, organization_id) references public.scaffold_inspections (id, organization_id),
  constraint scaffold_inspections_corrects_fk foreign key (corrects_inspection_id, organization_id) references public.scaffold_inspections (id, organization_id),
  constraint scaffold_inspections_superseded_by_fk foreign key (superseded_by_id, organization_id) references public.scaffold_inspections (id, organization_id)
);

comment on table public.scaffold_inspections is
  'One inspection event for a scaffold. HSEQ evidence — never hard-deleted (no DELETE grant at all). `status` (draft/finalized) is the workflow state; `outcome` is the safety determination, set only at finalization. A finalized row is immutable except for `superseded_by_id`, set by finalize_scaffold_inspection() when a LATER inspection corrects it via `corrects_inspection_id` — the original''s inspector, outcome, and checklist are never altered, only pointed forward to its correction (see this migration''s header comment).';
comment on column public.scaffold_inspections.previous_inspection_id is
  'The earlier inspection this one re-inspects (a genuine follow-up, e.g. after defects were fixed) — distinct from corrects_inspection_id, which marks an ERROR CORRECTION to a finalized record, not a new inspection event. Required when inspection_reason = ''reinspection_following_defects'' (validate_scaffold_inspection_insert()) — this milestone''s "re-inspection must reference the earlier inspection" requirement.';
comment on column public.scaffold_inspections.expires_at is
  'Computed ONCE at finalization from resolve_scaffold_inspection_validity_days(), never recomputed later even if org/project configuration subsequently changes — a past inspection''s validity period should not silently change retroactively. "Is this currently expired" is always derived (expires_at < now()), never a separate stored flag.';
comment on column public.scaffold_inspections.inspector_id is
  'ON DELETE RESTRICT — matches lmra_assessments.responsible_foreman_id: an inspection must always show who performed it, immutably.';

create index scaffold_inspections_organization_id_idx on public.scaffold_inspections (organization_id);
create index scaffold_inspections_scaffold_id_idx on public.scaffold_inspections (scaffold_id);
create index scaffold_inspections_project_id_idx on public.scaffold_inspections (project_id);
create index scaffold_inspections_status_idx on public.scaffold_inspections (organization_id, status);
create index scaffold_inspections_expires_at_idx on public.scaffold_inspections (organization_id, expires_at);
create index scaffold_inspections_inspector_id_idx on public.scaffold_inspections (inspector_id);

create trigger scaffold_inspections_set_updated_at
  before update on public.scaffold_inspections
  for each row execute function public.set_updated_at();

-- Keeps project_id in sync with the parent scaffold at insert time —
-- never client-trusted — same pattern as
-- sync_corrective_action_project_id() in the Safety Observations
-- migration.
create or replace function public.sync_scaffold_inspection_project_id()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  select project_id into new.project_id from public.scaffolds where id = new.scaffold_id and organization_id = new.organization_id;
  if new.project_id is null then
    raise exception 'scaffold % not found in organization %', new.scaffold_id, new.organization_id;
  end if;
  return new;
end;
$$;

create trigger scaffold_inspections_a_sync_project_id
  before insert on public.scaffold_inspections
  for each row execute function public.sync_scaffold_inspection_project_id();

create or replace function public.validate_scaffold_inspection_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_previous_scaffold_id uuid;
  v_corrects_status public.scaffold_inspection_status;
begin
  perform public.assert_project_not_archived(new.project_id);
  perform public.assert_employee_eligible_for_assignment(new.inspector_id);

  if new.inspection_reason = 'reinspection_following_defects' and new.previous_inspection_id is null then
    raise exception 'a re-inspection following defects must reference the earlier inspection (previous_inspection_id)';
  end if;

  if new.previous_inspection_id is not null then
    select scaffold_id into v_previous_scaffold_id from public.scaffold_inspections where id = new.previous_inspection_id;
    if v_previous_scaffold_id is distinct from new.scaffold_id then
      raise exception 'previous_inspection_id must reference an inspection of the same scaffold';
    end if;
  end if;

  if new.corrects_inspection_id is not null then
    select status into v_corrects_status from public.scaffold_inspections where id = new.corrects_inspection_id and scaffold_id = new.scaffold_id;
    if v_corrects_status is null then
      raise exception 'corrects_inspection_id must reference a finalized inspection of the same scaffold';
    end if;
    if v_corrects_status <> 'finalized' then
      raise exception 'can only correct a FINALIZED inspection';
    end if;
  end if;

  -- Draft is always the entry state — outcome/finalized_at/finalized_by/
  -- superseded_by_id are only ever set by finalize_scaffold_inspection()
  -- and its correction side-effect, never at creation.
  new.status := 'draft';
  new.outcome := null;
  new.finalized_at := null;
  new.finalized_by := null;
  new.superseded_by_id := null;

  return new;
end;
$$;

create trigger scaffold_inspections_b_validate_insert
  before insert on public.scaffold_inspections
  for each row execute function public.validate_scaffold_inspection_insert();

-- Fixed 24-row checklist, auto-created the moment the inspection is
-- created — same rationale as create_initial_lmra_hazards(). SECURITY
-- DEFINER: scaffold_inspection_items has no INSERT grant for
-- `authenticated` at all (only the trigger ever inserts here — see the
-- grants below), so a SECURITY INVOKER trigger fired by a real user's
-- session would have its own insert rejected by that same missing grant.
-- This is the exact bug create_initial_lmra_hazards() had before being
-- fixed to SECURITY DEFINER (20260802090000_lmra_hazards_trigger_security_definer.sql)
-- — caught here in review before ever being applied, not via a repeat
-- incident.
create or replace function public.create_initial_scaffold_inspection_items()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.scaffold_inspection_items (organization_id, scaffold_inspection_id, item_type)
  select new.organization_id, new.id, unnest(enum_range(null::public.scaffold_inspection_item_type));
  return new;
end;
$$;

create trigger scaffold_inspections_create_initial_items
  after insert on public.scaffold_inspections
  for each row execute function public.create_initial_scaffold_inspection_items();

-- Update guard: draft rows are freely editable by an authorized editor; a
-- finalized row is immutable EXCEPT the one narrow correction-linkage
-- exception (superseded_by_id going from null to a value). The
-- draft -> finalized transition itself is validated and computed HERE
-- (restrictions required, zero unresolved defects for safe_for_use,
-- expires_at) rather than only inside finalize_scaffold_inspection()
-- below — deliberately so these rules are enforced for EVERY update path
-- that could ever set status = 'finalized', not just callers that go
-- through the RPC (this milestone's explicit "enforce critical
-- permissions through RLS and database triggers, not application code
-- alone" instruction — a trigger-only check the RPC could be bypassed
-- around would not actually satisfy that). finalize_scaffold_inspection()
-- is still the intended entry point (a friendlier function signature plus
-- the correction-supersede side effect), but it is a thin wrapper around
-- a plain UPDATE that this trigger would validate identically either way.
create or replace function public.validate_scaffold_inspection_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_unresolved_count int;
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.scaffold_id is distinct from old.scaffold_id
    or new.project_id is distinct from old.project_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'scaffold inspection identity/creation fields cannot be changed';
  end if;

  -- expires_at/finalized_at/finalized_by are system-managed — never
  -- directly settable by a client update, only computed by THIS trigger's
  -- own finalization branch below (which reassigns them after this reset,
  -- so that assignment wins). Forcing them back to old here first closes
  -- off a path where a plain "status unchanged" edit could otherwise carry
  -- an arbitrary value through untouched.
  new.expires_at := old.expires_at;
  new.finalized_at := old.finalized_at;
  new.finalized_by := old.finalized_by;

  if old.status = 'finalized' then
    if new.superseded_by_id is not distinct from old.superseded_by_id then
      raise exception 'a finalized scaffold inspection cannot be modified — corrections are a new linked inspection (corrects_inspection_id), not an edit';
    end if;
    if old.superseded_by_id is not null then
      raise exception 'this inspection has already been superseded by a correction and cannot be modified again';
    end if;
    -- Only superseded_by_id may change, and only null -> a value.
    if new.inspection_reason is distinct from old.inspection_reason
      or new.previous_inspection_id is distinct from old.previous_inspection_id
      or new.corrects_inspection_id is distinct from old.corrects_inspection_id
      or new.correction_reason is distinct from old.correction_reason
      or new.inspector_id is distinct from old.inspector_id
      or new.inspected_at is distinct from old.inspected_at
      or new.status is distinct from old.status
      or new.outcome is distinct from old.outcome
      or new.restrictions_notes is distinct from old.restrictions_notes
      or new.expires_at is distinct from old.expires_at
      or new.notes is distinct from old.notes
      or new.finalized_at is distinct from old.finalized_at
      or new.finalized_by is distinct from old.finalized_by then
      raise exception 'a finalized scaffold inspection is immutable except for recording that it was superseded by a correction';
    end if;
    return new;
  end if;

  -- Still draft. Any update that does NOT touch status at all is a plain
  -- content edit — allowed freely (RLS already gates who may attempt it).
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status <> 'finalized' then
    raise exception 'a draft scaffold inspection may only transition to finalized, not directly to %', new.status;
  end if;

  -- draft -> finalized: the actual finalization rules.
  if new.outcome is null then
    raise exception 'an outcome is required to finalize a scaffold inspection';
  end if;

  if new.outcome = 'safe_with_restrictions' and (new.restrictions_notes is null or btrim(new.restrictions_notes) = '') then
    raise exception 'restrictions must be recorded when the outcome is safe with restrictions';
  end if;
  if new.outcome <> 'safe_with_restrictions' then
    new.restrictions_notes := null;
  end if;

  select count(*) into v_unresolved_count
  from public.scaffold_defects
  where scaffold_inspection_id = new.id
    and status not in ('closed', 'rejected');

  if new.outcome = 'safe_for_use' and v_unresolved_count > 0 then
    raise exception 'cannot finalize as safe for use while % unresolved defect(s) remain for this inspection', v_unresolved_count;
  end if;

  new.expires_at := now() + make_interval(days => public.resolve_scaffold_inspection_validity_days(new.project_id));
  new.finalized_at := now();
  new.finalized_by := auth.uid();

  return new;
end;
$$;

create trigger scaffold_inspections_validate_update
  before update on public.scaffold_inspections
  for each row execute function public.validate_scaffold_inspection_update();

-- ── 5) scaffold_inspection_items — the fixed 24-item checklist ────────
create table public.scaffold_inspection_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  scaffold_inspection_id uuid not null references public.scaffold_inspections (id) on delete cascade,
  item_type public.scaffold_inspection_item_type not null,
  result public.scaffold_inspection_item_result not null default 'acceptable',
  comment text,
  required_corrective_action text,
  severity public.scaffold_defect_severity,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scaffold_inspection_items_one_row_per_type unique (scaffold_inspection_id, item_type)
);

comment on table public.scaffold_inspection_items is
  'The fixed 24-item checklist for one scaffold_inspections row — exactly 24 rows per inspection, one per scaffold_inspection_item_type value, auto-created by create_initial_scaffold_inspection_items() above.';

create index scaffold_inspection_items_inspection_id_idx on public.scaffold_inspection_items (scaffold_inspection_id);
create index scaffold_inspection_items_organization_id_idx on public.scaffold_inspection_items (organization_id);

create trigger scaffold_inspection_items_set_updated_at
  before update on public.scaffold_inspection_items
  for each row execute function public.set_updated_at();

create or replace function public.assert_scaffold_inspection_is_draft(target_inspection_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status public.scaffold_inspection_status;
begin
  select status into v_status from public.scaffold_inspections where id = target_inspection_id;
  if v_status is null then
    raise exception 'scaffold inspection % not found', target_inspection_id;
  end if;
  if v_status <> 'draft' then
    raise exception 'scaffold inspection % is not a draft (status = %) — the checklist can only be changed while it is a draft', target_inspection_id, v_status;
  end if;
end;
$$;

create or replace function public.validate_scaffold_inspection_item_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.assert_scaffold_inspection_is_draft(new.scaffold_inspection_id);
  if new.scaffold_inspection_id is distinct from old.scaffold_inspection_id
    or new.item_type is distinct from old.item_type
    or new.organization_id is distinct from old.organization_id then
    raise exception 'a checklist row''s inspection/type/organization cannot be changed';
  end if;
  return new;
end;
$$;

create trigger scaffold_inspection_items_validate_update
  before update on public.scaffold_inspection_items
  for each row execute function public.validate_scaffold_inspection_item_update();

-- Bulk-update the 24 fixed checklist rows in one call — mirrors
-- save_lmra_hazards() exactly.
create or replace function public.save_scaffold_inspection_items(target_inspection_id uuid, target_items jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  update public.scaffold_inspection_items i
  set
    result = incoming.result,
    comment = nullif(btrim(incoming.comment), ''),
    required_corrective_action = nullif(btrim(incoming.required_corrective_action), ''),
    severity = incoming.severity
  from jsonb_to_recordset(target_items) as incoming(
    item_type public.scaffold_inspection_item_type,
    result public.scaffold_inspection_item_result,
    comment text,
    required_corrective_action text,
    severity public.scaffold_defect_severity
  )
  where i.scaffold_inspection_id = target_inspection_id
    and i.item_type = incoming.item_type;
end;
$$;

revoke all on function public.save_scaffold_inspection_items(uuid, jsonb) from public, anon;
grant execute on function public.save_scaffold_inspection_items(uuid, jsonb) to authenticated;

comment on function public.save_scaffold_inspection_items(uuid, jsonb) is
  'Bulk-updates scaffold_inspection_items rows for one inspection. SECURITY INVOKER — every underlying UPDATE still goes through scaffold_inspection_items RLS and validate_scaffold_inspection_item_update() (draft-only) exactly as individual updates would.';

-- ── 6) scaffold_defects ─────────────────────────────────────────────────
create table public.scaffold_defects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  scaffold_inspection_id uuid not null,
  -- Denormalized from the inspection for RLS-policy simplicity/performance.
  scaffold_id uuid not null,
  project_id uuid not null,
  inspection_item_id uuid,
  description text not null,
  severity public.scaffold_defect_severity not null default 'medium',
  responsible_person_id uuid not null,
  due_date date not null,
  immediate_control text,
  status public.scaffold_defect_status not null default 'open',
  completion_notes text,
  verification_notes text,
  verified_by uuid references public.profiles (id) on delete set null,
  verified_at timestamptz,
  reopen_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  constraint scaffold_defects_description_not_blank check (btrim(description) <> ''),
  constraint scaffold_defects_inspection_fk foreign key (scaffold_inspection_id, organization_id) references public.scaffold_inspections (id, organization_id) on delete cascade,
  constraint scaffold_defects_scaffold_fk foreign key (scaffold_id, organization_id) references public.scaffolds (id, organization_id) on delete cascade,
  constraint scaffold_defects_project_fk foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  constraint scaffold_defects_responsible_person_fk foreign key (responsible_person_id, organization_id) references public.employees (id, organization_id) on delete restrict,
  constraint scaffold_defects_inspection_item_fk foreign key (inspection_item_id) references public.scaffold_inspection_items (id) on delete set null
);

comment on table public.scaffold_defects is
  'A remediation item raised from a scaffold inspection (optionally tied to a specific checklist row via inspection_item_id — "checklist reference"). Deliberately a dedicated table, not a reuse of corrective_actions — see this migration''s header comment. HSEQ evidence — never hard-deleted (no DELETE grant at all). "Overdue" is NOT a stored status — derived from due_date/status identically to corrective_actions (modules/scaffolds/types.ts''s isScaffoldDefectOverdue()).';
comment on column public.scaffold_defects.responsible_person_id is
  'ON DELETE RESTRICT — same rationale as every other "accountable party" FK in this schema. Whoever this is assigned to may progress THIS defect''s status regardless of their own module-level role (see the RLS below) — this is how a Foreman, otherwise view-only on Scaffold Inspections, still acts on a defect they''re responsible for fixing.';

create index scaffold_defects_organization_id_status_due_date_idx on public.scaffold_defects (organization_id, status, due_date);
create index scaffold_defects_responsible_person_id_status_idx on public.scaffold_defects (responsible_person_id, status);
create index scaffold_defects_inspection_id_idx on public.scaffold_defects (scaffold_inspection_id);
create index scaffold_defects_scaffold_id_idx on public.scaffold_defects (scaffold_id);
create index scaffold_defects_project_id_idx on public.scaffold_defects (project_id);

create trigger scaffold_defects_set_updated_at
  before update on public.scaffold_defects
  for each row execute function public.set_updated_at();

create or replace function public.sync_scaffold_defect_denormalized_columns()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  select scaffold_id, project_id into new.scaffold_id, new.project_id
  from public.scaffold_inspections
  where id = new.scaffold_inspection_id and organization_id = new.organization_id;

  if new.scaffold_id is null then
    raise exception 'scaffold inspection % not found in organization %', new.scaffold_inspection_id, new.organization_id;
  end if;

  return new;
end;
$$;

create trigger scaffold_defects_a_sync_columns
  before insert on public.scaffold_defects
  for each row execute function public.sync_scaffold_defect_denormalized_columns();

create or replace function public.validate_scaffold_defect_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.assert_project_not_archived(new.project_id);
  perform public.assert_employee_eligible_for_assignment(new.responsible_person_id);
  if new.inspection_item_id is not null then
    if not exists (select 1 from public.scaffold_inspection_items i where i.id = new.inspection_item_id and i.scaffold_inspection_id = new.scaffold_inspection_id) then
      raise exception 'inspection_item_id must belong to the same inspection';
    end if;
  end if;
  return new;
end;
$$;

create trigger scaffold_defects_b_validate_insert
  before insert on public.scaffold_defects
  for each row execute function public.validate_scaffold_defect_insert();

-- Who may close/reject an awaiting_verification defect, or reopen a
-- closed/rejected one — mirrors can_close_corrective_action() in shape:
-- HSE Manager (org-wide) OR [HSE Officer/Inspector holding project access
-- AND (authored it OR is the responsible person)]. No Project-Manager-
-- style unrestricted-within-project branch here — PM is View-only for
-- this whole module (docs' "V⁴", not "M⁴").
create or replace function public.can_close_scaffold_defect(
  target_organization_id uuid,
  target_project_id uuid,
  target_created_by uuid,
  target_responsible_person_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    public.has_organization_role(target_organization_id, 'hseq_manager')
    or (
      public.has_any_organization_role(target_organization_id, array['hse_officer', 'inspector'])
      and public.has_project_access(target_project_id)
      and (
        target_created_by = auth.uid()
        or exists (
          select 1 from public.employees e
          where e.id = target_responsible_person_id and e.profile_id = auth.uid()
        )
      )
    );
$$;

revoke all on function public.can_close_scaffold_defect(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.can_close_scaffold_defect(uuid, uuid, uuid, uuid) to authenticated;

-- Manage-tier for this module = hseq_manager (org-wide) or hse_officer/
-- inspector with project access — used both by the trigger below and
-- mirrored in modules/scaffolds/permissions.ts.
create or replace function public.is_scaffold_manage_tier(target_organization_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    public.has_organization_role(target_organization_id, 'hseq_manager')
    or (
      public.has_any_organization_role(target_organization_id, array['hse_officer', 'inspector'])
      and public.has_project_access(target_project_id)
    );
$$;

revoke all on function public.is_scaffold_manage_tier(uuid, uuid) from public, anon;
grant execute on function public.is_scaffold_manage_tier(uuid, uuid) to authenticated;

create or replace function public.validate_scaffold_defect_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.scaffold_inspection_id is distinct from old.scaffold_inspection_id
    or new.scaffold_id is distinct from old.scaffold_id
    or new.project_id is distinct from old.project_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'scaffold defect identity/creation fields cannot be changed';
  end if;

  -- Non-manage-tier actors (i.e. the defect's own responsible person,
  -- acting on their own assignment): status progress only, never
  -- due_date/severity/description/responsible_person_id, and never a
  -- direct move to closed/rejected.
  if not public.is_scaffold_manage_tier(new.organization_id, new.project_id) then
    if new.due_date is distinct from old.due_date
      or new.severity is distinct from old.severity
      or new.description is distinct from old.description
      or new.responsible_person_id is distinct from old.responsible_person_id then
      raise exception 'only HSE Manager/HSE Officer/Inspector may change a scaffold defect''s due date, severity, description, or responsible person';
    end if;
    if new.status in ('closed', 'rejected') and old.status not in ('closed', 'rejected') then
      raise exception 'only HSE Manager/HSE Officer/Inspector may close or reject a scaffold defect';
    end if;
    if old.status in ('closed', 'rejected') and new.status not in ('closed', 'rejected') then
      raise exception 'only HSE Manager/HSE Officer/Inspector may reopen a scaffold defect';
    end if;
  end if;

  -- Closing/rejecting/reopening always requires can_close_scaffold_defect()
  -- authority — "leaving closed/rejected" means ANY destination status,
  -- not just specifically 'open' (the corrective_actions gap-fix, applied
  -- here from the start).
  if (new.status in ('closed', 'rejected') and old.status not in ('closed', 'rejected'))
    or (old.status in ('closed', 'rejected') and new.status not in ('closed', 'rejected')) then
    if not public.can_close_scaffold_defect(new.organization_id, new.project_id, new.created_by, new.responsible_person_id) then
      raise exception 'you do not have authority to close, reject, or reopen this scaffold defect';
    end if;
  end if;

  -- Reject/reopen require a FRESHLY supplied reason (IS DISTINCT FROM the
  -- old value, not merely non-empty) — the corrective_actions stale-reason
  -- fix, applied here from the start.
  if new.status = 'rejected' and old.status <> 'rejected'
    and (new.reopen_reason is null or btrim(new.reopen_reason) = '' or new.reopen_reason is not distinct from old.reopen_reason) then
    raise exception 'a reason is required when rejecting a scaffold defect';
  end if;

  if old.status in ('closed', 'rejected') and new.status not in ('closed', 'rejected')
    and (new.reopen_reason is null or btrim(new.reopen_reason) = '' or new.reopen_reason is not distinct from old.reopen_reason) then
    raise exception 'a reason is required when reopening a scaffold defect';
  end if;

  return new;
end;
$$;

create trigger scaffold_defects_validate_update
  before update on public.scaffold_defects
  for each row execute function public.validate_scaffold_defect_update();

-- ── 7) scaffolds.status sync from finalized inspections ────────────────
create or replace function public.sync_scaffold_status_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_status public.scaffold_status;
begin
  if new.status <> 'finalized' or old.status = 'finalized' then
    return new;
  end if;

  v_new_status := case new.outcome
    when 'safe_for_use' then 'safe'
    when 'safe_with_restrictions' then 'restricted'
    when 'awaiting_corrective_action' then 'awaiting_corrective_action'
    when 'unsafe_do_not_use' then 'unsafe'
    when 'closed_dismantled' then 'closed'
  end;

  update public.scaffolds
  set status = v_new_status, updated_by = new.finalized_by
  where id = new.scaffold_id;

  return new;
end;
$$;

comment on function public.sync_scaffold_status_snapshot() is
  'The only writer of scaffolds.status (see the column-privilege revoke below). Fires whenever an inspection transitions draft -> finalized (including a correction''s own finalization, which is exactly how a correction actually takes effect on the register — the newly finalized correction''s outcome becomes the scaffold''s current status, same as any other finalization). SECURITY DEFINER because the acting user is not necessarily granted direct UPDATE on scaffolds.status themselves — same rationale as sync_employee_employment_snapshot().';

create trigger scaffold_inspections_sync_status
  after update on public.scaffold_inspections
  for each row execute function public.sync_scaffold_status_snapshot();

-- ── 8) finalize_scaffold_inspection — the intended entry point for finalizing ──
-- The substantive rules (restrictions required, zero unresolved defects
-- for safe_for_use, expires_at computation) live in
-- validate_scaffold_inspection_update() above, not here — so they apply
-- no matter how a row reaches draft -> finalized, not only through this
-- function. This wrapper exists for a friendlier call signature and to
-- sequence the correction-supersede side effect atomically with the
-- finalizing UPDATE.
create or replace function public.finalize_scaffold_inspection(
  target_inspection_id uuid,
  target_outcome public.scaffold_inspection_outcome,
  target_restrictions_notes text default null
)
returns public.scaffold_inspections
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_inspection public.scaffold_inspections;
begin
  update public.scaffold_inspections
  set status = 'finalized', outcome = target_outcome, restrictions_notes = target_restrictions_notes
  where id = target_inspection_id and status = 'draft'
  returning * into v_inspection;

  if v_inspection is null then
    raise exception 'scaffold inspection % not found, or it is not a draft', target_inspection_id;
  end if;

  if v_inspection.corrects_inspection_id is not null then
    update public.scaffold_inspections
    set superseded_by_id = v_inspection.id
    where id = v_inspection.corrects_inspection_id;
  end if;

  return v_inspection;
end;
$$;

comment on function public.finalize_scaffold_inspection(uuid, public.scaffold_inspection_outcome, text) is
  'The intended entry point from draft to finalized — see validate_scaffold_inspection_update() for where the actual rules live (restrictions required, zero unresolved defects for safe_for_use, expires_at computation), enforced there so they apply to this AND any other update path, not just this function. This wrapper additionally links a correction back to the record it corrects. SECURITY INVOKER — both UPDATE statements inside still go through scaffold_inspections RLS/the trigger exactly as direct updates would; this function only sequences them atomically.';

revoke all on function public.finalize_scaffold_inspection(uuid, public.scaffold_inspection_outcome, text) from public, anon;
grant execute on function public.finalize_scaffold_inspection(uuid, public.scaffold_inspection_outcome, text) to authenticated;

-- ── 9) RLS ────────────────────────────────────────────────────────────
alter table public.scaffolds enable row level security;
alter table public.scaffolds force row level security;
alter table public.scaffold_inspections enable row level security;
alter table public.scaffold_inspections force row level security;
alter table public.scaffold_inspection_items enable row level security;
alter table public.scaffold_inspection_items force row level security;
alter table public.scaffold_defects enable row level security;
alter table public.scaffold_defects force row level security;

-- No DELETE grant anywhere on scaffolds/scaffold_inspections/
-- scaffold_defects — HSEQ evidence, never hard-deleted. Line-item
-- checklist rows follow the same "no INSERT/DELETE for authenticated"
-- shape as lmra_hazards (created only by the trigger, never independently).
grant select, insert, update on public.scaffolds to authenticated;
grant select, insert, update on public.scaffold_inspections to authenticated;
grant select, update on public.scaffold_inspection_items to authenticated;
grant select, insert, update on public.scaffold_defects to authenticated;

-- Column-level lockdown: scaffolds.status is sync-only (§7).
revoke update on public.scaffolds from authenticated;
grant update (
  tag_number, work_area, structure_reference, scaffold_type, intended_use,
  max_load_class, max_height_meters, erected_by, responsible_foreman_id,
  erected_at, notes, updated_by
) on public.scaffolds to authenticated;

-- scaffolds: HSE Manager unconditional org-wide (F). Company Manager/
-- Workforce Coordinator unconditional org-wide VIEW (V). Everyone else
-- (PM/HO/FM/IN/EM) sees it via has_project_access — visibility is the
-- same "V⁴" read for all of them; only HSE Officer/Inspector additionally
-- get write (see the INSERT/UPDATE policies below).
create policy scaffolds_select
  on public.scaffolds
  for select
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager', 'hseq_manager'])
      or public.has_project_access(project_id)
    )
  );

create policy scaffolds_insert
  on public.scaffolds
  for insert
  to authenticated
  with check (
    public.is_organization_member(organization_id)
    and public.is_scaffold_manage_tier(organization_id, project_id)
  );

create policy scaffolds_update
  on public.scaffolds
  for update
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and public.is_scaffold_manage_tier(organization_id, project_id)
  )
  with check (
    public.is_organization_member(organization_id)
    and public.is_scaffold_manage_tier(organization_id, project_id)
  );

create policy scaffold_inspections_select
  on public.scaffold_inspections
  for select
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager', 'hseq_manager'])
      or public.has_project_access(project_id)
    )
  );

create policy scaffold_inspections_insert
  on public.scaffold_inspections
  for insert
  to authenticated
  with check (
    public.is_organization_member(organization_id)
    and public.is_scaffold_manage_tier(organization_id, project_id)
  );

create policy scaffold_inspections_update
  on public.scaffold_inspections
  for update
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and public.is_scaffold_manage_tier(organization_id, project_id)
  )
  with check (
    public.is_organization_member(organization_id)
    and public.is_scaffold_manage_tier(organization_id, project_id)
  );

create policy scaffold_inspection_items_select
  on public.scaffold_inspection_items
  for select
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager', 'hseq_manager'])
      or exists (select 1 from public.scaffold_inspections si where si.id = scaffold_inspection_items.scaffold_inspection_id and public.has_project_access(si.project_id))
    )
  );

create policy scaffold_inspection_items_update
  on public.scaffold_inspection_items
  for update
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and exists (select 1 from public.scaffold_inspections si where si.id = scaffold_inspection_items.scaffold_inspection_id and public.is_scaffold_manage_tier(organization_id, si.project_id))
  )
  with check (
    public.is_organization_member(organization_id)
    and exists (select 1 from public.scaffold_inspections si where si.id = scaffold_inspection_items.scaffold_inspection_id and public.is_scaffold_manage_tier(organization_id, si.project_id))
  );

-- scaffold_defects SELECT: same org-wide-role/project-access shape as the
-- rest, PLUS the defect's own responsible person (their real interest
-- here) — matches corrective_actions_select's precedent.
create policy scaffold_defects_select
  on public.scaffold_defects
  for select
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager', 'hseq_manager'])
      or public.has_project_access(project_id)
      or exists (select 1 from public.employees e where e.id = scaffold_defects.responsible_person_id and e.profile_id = auth.uid())
    )
  );

create policy scaffold_defects_insert
  on public.scaffold_defects
  for insert
  to authenticated
  with check (
    public.is_organization_member(organization_id)
    and public.is_scaffold_manage_tier(organization_id, project_id)
  );

-- UPDATE: manage-tier (unrestricted within scope) OR the defect's own
-- responsible person (progress-only — validate_scaffold_defect_update()
-- enforces which columns/transitions that narrower path actually allows).
create policy scaffold_defects_update
  on public.scaffold_defects
  for update
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.is_scaffold_manage_tier(organization_id, project_id)
      or exists (select 1 from public.employees e where e.id = scaffold_defects.responsible_person_id and e.profile_id = auth.uid())
    )
  )
  with check (
    public.is_organization_member(organization_id)
    and (
      public.is_scaffold_manage_tier(organization_id, project_id)
      or exists (select 1 from public.employees e where e.id = scaffold_defects.responsible_person_id and e.profile_id = auth.uid())
    )
  );
