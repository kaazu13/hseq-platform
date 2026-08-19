-- ============================================================================
-- Configurable scaffold inspection frequency + scaffold location
-- ============================================================================
-- Two independent additions, bundled in one migration because both are
-- foundational for the new Scaffold Inspection Dashboard / Scaffold Map:
--
-- 1) INSPECTION FREQUENCY: `companies`/`projects` already had a bare
--    `scaffold_inspection_validity_days integer` column (added by
--    20260803120000, never actually exposed anywhere in the app — grep
--    confirms zero callers of resolve_scaffold_inspection_validity_days()
--    outside its own doc comment). This migration keeps that integer as
--    the real day-count (unit callers already understand) and adds a
--    companion `_interval_type` enum column at every level — including a
--    NEW scaffold-level override, which did not exist before — so the UI
--    can render "Daily / Every 7 days / Every 30 days / Custom" instead of
--    a bare number, while a CHECK constraint keeps type and days from
--    drifting out of sync. Hierarchy: scaffold override -> project
--    override -> company override -> system default (seven_days / 7).
--
-- 2) LOCATION: `scaffolds` gets optional `latitude`/`longitude` (mirrors
--    `projects.site_latitude/site_longitude`'s exact range-check
--    convention from 20260901114000) for the new Scaffold Map.
--
-- Also replaces `validate_scaffold_inspection_update()`'s expires_at
-- computation to (a) resolve the effective interval from the SCAFFOLD
-- (not just the project), (b) snapshot the effective type+days onto the
-- inspection row at finalization (so a later frequency change never
-- rewrites history), and (c) compute the due date from the inspection's
-- PROJECT-LOCAL calendar date, not the finalization instant — see this
-- file's comment on resolve_scaffold_inspection_interval_for_scaffold()
-- for the exact reasoning.
-- ============================================================================

-- ── 1) Interval type enum ───────────────────────────────────────────────
create type public.scaffold_inspection_interval_type as enum ('daily', 'seven_days', 'thirty_days', 'custom');

comment on type public.scaffold_inspection_interval_type is
  'How a scaffold inspection re-inspection interval is expressed in the UI. "custom" allows any positive day count; the other three are fixed presets whose day count is enforced by a CHECK constraint on every table that carries this column (see scaffolds_interval_type_days_consistent etc.) so type and days can never silently drift apart.';

-- ── 2) Company/project default overrides — add the type column beside
--       the existing integer column, both nullable together (null = no
--       override at this level, falls through to the next level down).
-- ──
alter table public.companies add column scaffold_inspection_interval_type public.scaffold_inspection_interval_type;
alter table public.projects add column scaffold_inspection_interval_type public.scaffold_inspection_interval_type;

comment on column public.companies.scaffold_inspection_interval_type is
  'Company-wide default re-inspection interval TYPE, paired with scaffold_inspection_validity_days (the day count). Null = no company-level override. See resolve_scaffold_inspection_interval_for_project().';
comment on column public.projects.scaffold_inspection_interval_type is
  'Project default re-inspection interval TYPE, paired with scaffold_inspection_validity_days. Null = no project-level override (falls through to the company default, then the system default of seven_days/7).';

alter table public.companies add constraint companies_interval_type_days_paired
  check ((scaffold_inspection_interval_type is null) = (scaffold_inspection_validity_days is null));
alter table public.projects add constraint projects_interval_type_days_paired
  check ((scaffold_inspection_interval_type is null) = (scaffold_inspection_validity_days is null));

alter table public.companies add constraint companies_interval_type_days_consistent check (
  scaffold_inspection_interval_type is null
  or (scaffold_inspection_interval_type = 'daily' and scaffold_inspection_validity_days = 1)
  or (scaffold_inspection_interval_type = 'seven_days' and scaffold_inspection_validity_days = 7)
  or (scaffold_inspection_interval_type = 'thirty_days' and scaffold_inspection_validity_days = 30)
  or (scaffold_inspection_interval_type = 'custom' and scaffold_inspection_validity_days > 0)
);
alter table public.projects add constraint projects_interval_type_days_consistent check (
  scaffold_inspection_interval_type is null
  or (scaffold_inspection_interval_type = 'daily' and scaffold_inspection_validity_days = 1)
  or (scaffold_inspection_interval_type = 'seven_days' and scaffold_inspection_validity_days = 7)
  or (scaffold_inspection_interval_type = 'thirty_days' and scaffold_inspection_validity_days = 30)
  or (scaffold_inspection_interval_type = 'custom' and scaffold_inspection_validity_days > 0)
);

-- ── 3) Scaffold-specific override — genuinely new: no per-scaffold
--       interval override existed before this migration. Null = inherit
--       the project's effective default.
-- ──
alter table public.scaffolds add column inspection_interval_type public.scaffold_inspection_interval_type;
alter table public.scaffolds add column inspection_interval_days integer;

comment on column public.scaffolds.inspection_interval_type is
  'This scaffold''s OWN re-inspection interval override. Null = inherit the project''s effective default (resolve_scaffold_inspection_interval_for_project()). New scaffolds default to null (inherit) unless the creator explicitly picks a different frequency — see modules/scaffolds/components/scaffold-form.tsx.';
comment on column public.scaffolds.inspection_interval_days is
  'Paired with inspection_interval_type — see that column''s comment.';

alter table public.scaffolds add constraint scaffolds_interval_type_days_paired
  check ((inspection_interval_type is null) = (inspection_interval_days is null));
alter table public.scaffolds add constraint scaffolds_interval_type_days_consistent check (
  inspection_interval_type is null
  or (inspection_interval_type = 'daily' and inspection_interval_days = 1)
  or (inspection_interval_type = 'seven_days' and inspection_interval_days = 7)
  or (inspection_interval_type = 'thirty_days' and inspection_interval_days = 30)
  or (inspection_interval_type = 'custom' and inspection_interval_days > 0)
);

-- ── 4) Scaffold location (optional) ─────────────────────────────────────
alter table public.scaffolds add column latitude numeric(9, 6);
alter table public.scaffolds add column longitude numeric(9, 6);

comment on column public.scaffolds.latitude is
  'Optional scaffold location for the Scaffold Map — mirrors projects.site_latitude''s range/precision convention (20260901114000). Null for every scaffold created before this feature and any scaffold whose location was never set — displayed as "Location not set", never required.';
comment on column public.scaffolds.longitude is
  'Paired with latitude — see that column''s comment.';

alter table public.scaffolds add constraint scaffolds_latitude_range check (latitude is null or (latitude between -90 and 90));
alter table public.scaffolds add constraint scaffolds_longitude_range check (longitude is null or (longitude between -180 and 180));
alter table public.scaffolds add constraint scaffolds_lat_lng_paired check ((latitude is null) = (longitude is null));

-- ── 5) Historical snapshot on scaffold_inspections ──────────────────────
-- "Historical inspection must retain the validity rules that existed at
-- finalization" — a later scaffold/project/company frequency change must
-- never rewrite what an already-finalized inspection's validity WAS.
alter table public.scaffold_inspections add column interval_type_at_finalization public.scaffold_inspection_interval_type;
alter table public.scaffold_inspections add column interval_days_at_finalization integer;

comment on column public.scaffold_inspections.interval_type_at_finalization is
  'The effective inspection-frequency TYPE that was in force when THIS inspection was finalized, snapshotted once by validate_scaffold_inspection_update() and never recomputed — see expires_at''s own comment for why. Null for draft inspections (not yet finalized) and for any inspection finalized before this column existed.';
comment on column public.scaffold_inspections.interval_days_at_finalization is
  'Paired with interval_type_at_finalization — see that column''s comment. Example: interval_days_at_finalization = 7.';

-- ── 6) Resolver functions ────────────────────────────────────────────────
-- Replaces resolve_scaffold_inspection_validity_days(project_id) (added by
-- 20260803120000, confirmed to have zero callers anywhere in the app
-- today) with two functions returning BOTH type and days, matching the
-- new scaffold-level override tier:
drop function if exists public.resolve_scaffold_inspection_validity_days(uuid);

create or replace function public.resolve_scaffold_inspection_interval_for_project(target_project_id uuid)
returns table (interval_type public.scaffold_inspection_interval_type, interval_days integer)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    coalesce(p.scaffold_inspection_interval_type, o.scaffold_inspection_interval_type, 'seven_days'::public.scaffold_inspection_interval_type),
    coalesce(p.scaffold_inspection_validity_days, o.scaffold_inspection_validity_days, 7)
  from public.projects p
  join public.companies o on o.id = p.company_id
  where p.id = target_project_id;
$$;

comment on function public.resolve_scaffold_inspection_interval_for_project(uuid) is
  'Project override -> company override -> system default (seven_days / 7 days). Used (a) to show an authorized scaffold creator the effective frequency BEFORE they pick one, and (b) as the fallback inside resolve_scaffold_inspection_interval_for_scaffold() below when the scaffold itself has no override.';

revoke all on function public.resolve_scaffold_inspection_interval_for_project(uuid) from public, anon;
grant execute on function public.resolve_scaffold_inspection_interval_for_project(uuid) to authenticated;

create or replace function public.resolve_scaffold_inspection_interval_for_scaffold(target_scaffold_id uuid)
returns table (interval_type public.scaffold_inspection_interval_type, interval_days integer)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    coalesce(s.inspection_interval_type, proj.interval_type),
    coalesce(s.inspection_interval_days, proj.interval_days)
  from public.scaffolds s
  cross join lateral public.resolve_scaffold_inspection_interval_for_project(s.project_id) as proj
  where s.id = target_scaffold_id;
$$;

comment on function public.resolve_scaffold_inspection_interval_for_scaffold(uuid) is
  'Scaffold override -> resolve_scaffold_inspection_interval_for_project(). This is the single source of truth called by validate_scaffold_inspection_update() when finalizing an inspection — see this migration''s header comment for the full company->project->scaffold hierarchy.';

revoke all on function public.resolve_scaffold_inspection_interval_for_scaffold(uuid) from public, anon;
grant execute on function public.resolve_scaffold_inspection_interval_for_scaffold(uuid) to authenticated;

-- ── 7) Re-point validate_scaffold_inspection_update()'s finalize branch ──
-- Same full body as 20260810090000's definition, with ONLY the
-- expires_at/snapshot computation changed (marked below). Two real
-- behavior changes from before:
--  (a) The effective interval now comes from the SCAFFOLD (its own
--      override, or its project's effective default), not just the
--      project — matching the new three-tier hierarchy.
--  (b) expires_at is now computed from the inspection's PROJECT-LOCAL
--      calendar date (inspected_at converted into the project's own IANA
--      timezone), not the finalization instant — "17 Aug + 7 days = 24
--      Aug" must hold regardless of how many days elapse between the
--      physical inspection and someone getting around to finalizing it in
--      the app, and "which calendar day" a timestamp falls on is only
--      well-defined once you pick a timezone (Part AH's explicit "use
--      project local date" requirement). expires_at is stored as
--      UTC-midnight of that due DATE (via `::timestamp at time zone
--      'utc'`) specifically so that later reading it back with
--      `.toISOString().slice(0, 10)` in TypeScript always recovers the
--      exact intended calendar date, regardless of the reader's own
--      timezone — no further timezone conversion is needed anywhere else
--      in the app once this value is stored (see
--      modules/scaffolds/inspection-health.ts's resolveInspectionHealth()).
create or replace function public.validate_scaffold_inspection_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_unresolved_count int;
  v_project_timezone text;
  v_interval_type public.scaffold_inspection_interval_type;
  v_interval_days integer;
  v_inspection_local_date date;
begin
  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.scaffold_id is distinct from old.scaffold_id
    or new.project_id is distinct from old.project_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by
    or new.sequence_number is distinct from old.sequence_number then
    raise exception 'scaffold inspection identity/creation fields cannot be changed';
  end if;

  new.expires_at := old.expires_at;
  new.finalized_at := old.finalized_at;
  new.finalized_by := old.finalized_by;
  new.interval_type_at_finalization := old.interval_type_at_finalization;
  new.interval_days_at_finalization := old.interval_days_at_finalization;

  if old.voided_at is not null then
    raise exception 'a voided scaffold inspection cannot be modified';
  end if;

  if old.status = 'finalized' then
    if new.voided_at is distinct from old.voided_at
      or new.voided_by is distinct from old.voided_by
      or new.void_reason is distinct from old.void_reason then
      raise exception 'a finalized scaffold inspection cannot be voided — voiding only applies to drafts';
    end if;
    if new.superseded_by_id is not distinct from old.superseded_by_id then
      raise exception 'a finalized scaffold inspection cannot be modified — corrections are a new linked inspection (corrects_inspection_id), not an edit';
    end if;
    if old.superseded_by_id is not null then
      raise exception 'this inspection has already been superseded by a correction and cannot be modified again';
    end if;
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

  if new.voided_at is distinct from old.voided_at and new.voided_at is not null then
    if new.status is distinct from old.status
      or new.outcome is distinct from old.outcome
      or new.inspection_reason is distinct from old.inspection_reason
      or new.inspector_id is distinct from old.inspector_id
      or new.inspected_at is distinct from old.inspected_at
      or new.notes is distinct from old.notes then
      raise exception 'voiding a draft scaffold inspection cannot be combined with any other change in the same update';
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status <> 'finalized' then
    raise exception 'a draft scaffold inspection may only transition to finalized, not directly to %', new.status;
  end if;

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

  -- (a)+(b): effective interval from the scaffold hierarchy, due date from
  -- the project-local calendar date of the inspection itself.
  select interval_type, interval_days into v_interval_type, v_interval_days
  from public.resolve_scaffold_inspection_interval_for_scaffold(new.scaffold_id);

  select timezone into v_project_timezone from public.projects where id = new.project_id;
  v_inspection_local_date := (new.inspected_at at time zone coalesce(v_project_timezone, 'UTC'))::date;

  new.interval_type_at_finalization := v_interval_type;
  new.interval_days_at_finalization := v_interval_days;
  new.expires_at := (v_inspection_local_date + v_interval_days)::timestamp at time zone 'utc';
  new.finalized_at := now();
  new.finalized_by := auth.uid();

  return new;
end;
$$;

-- ── 8) Frequency-change audit ────────────────────────────────────────────
-- "Audit changes to scaffold inspection frequency: old, new, who,
-- timestamp, reason if existing audit model supports it" — reuses the
-- existing generic audit_events table (already used this way once, by
-- unlock_daily_teams() in 20260812090000) rather than adding a brand-new
-- dedicated table for a single narrow config change.
create or replace function public.audit_scaffold_interval_change()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.inspection_interval_type is distinct from old.inspection_interval_type
    or new.inspection_interval_days is distinct from old.inspection_interval_days then
    insert into public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, changes)
    values (
      new.company_id,
      auth.uid(),
      'update',
      'scaffold_inspection_interval',
      new.id,
      jsonb_build_object(
        'old_interval_type', old.inspection_interval_type,
        'old_interval_days', old.inspection_interval_days,
        'new_interval_type', new.inspection_interval_type,
        'new_interval_days', new.inspection_interval_days
      )
    );
  end if;
  return new;
end;
$$;

comment on function public.audit_scaffold_interval_change() is
  'Fires AFTER UPDATE on scaffolds — writes one audit_events row only when the inspection frequency override actually changed. A free-text reason isn''t captured here (scaffolds has no per-update reason field, unlike leave/absence corrections) — this records old/new/who/when, which is what the existing audit_events shape supports.';

create trigger scaffolds_audit_interval_change
  after update on public.scaffolds
  for each row execute function public.audit_scaffold_interval_change();

-- ── 9) Indexes ───────────────────────────────────────────────────────────
-- Reasoning documented per index — see docs note in the final report
-- rather than repeated here; all four back the new Scaffold Inspection
-- Dashboard/Map's real query shapes (a project-scoped active-scaffold
-- scan joined laterally to each scaffold's latest finalized inspection,
-- a project-wide "latest N finalized inspections" list, and an
-- inspector's "how many did I finalize today" count).
create index scaffolds_project_status_idx on public.scaffolds (project_id, status);
create index scaffold_inspections_scaffold_latest_idx on public.scaffold_inspections (scaffold_id, finalized_at desc) where status = 'finalized' and superseded_by_id is null;
create index scaffold_inspections_project_finalized_idx on public.scaffold_inspections (project_id, finalized_at desc) where status = 'finalized';
create index scaffold_inspections_inspector_finalized_idx on public.scaffold_inspections (inspector_id, finalized_at);
