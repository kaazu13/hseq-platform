-- Scaffold numbering + inspection reference sequence.
--
-- scaffolds.scaffold_number: a small positive integer, unique per PROJECT
-- (not per company — two different projects can both have scaffold #1).
--
-- scaffold_inspections.sequence_number: a small positive integer,
-- LIFETIME-CONTINUOUS per scaffold — never resets by date, never reused
-- even once an inspection is later voided (see the void-workflow
-- migration).
--
-- Both are auto-allocated server-side on insert via a DEDICATED counter
-- table + a SECURITY DEFINER allocator function, mirroring
-- allocate_employee_number()'s concurrency-safe pattern
-- (20260726100100_employee_numbering.sql) exactly: a single atomic
-- `update ... returning`, never `max()`/`count()` at allocation time
-- (unsafe under concurrent inserts). A dedicated counter table (rather
-- than a counter column colocated on `scaffolds`) deliberately avoids a
-- grant/trust-model conflict: `validate_scaffold_inspection_insert()`
-- stays SECURITY INVOKER (its existing, reviewed trust level) and never
-- needs UPDATE privilege on any scaffolds column to allocate a sequence
-- number — the counter table has NO grants to `authenticated` at all,
-- exactly like `scaffold_number_counters` below, only ever touched
-- through its own SECURITY DEFINER allocator.
--
-- The human-readable reference (e.g. "SI-7723-001") is NOT stored
-- anywhere — it's derived from scaffold_number + sequence_number at
-- display time (modules/scaffolds/types.ts's formatInspectionReference()),
-- matching this codebase's established "derive, don't duplicate-store a
-- formatted string" convention (getScaffoldDisplayStatus(),
-- formatScaffoldDimensions()).

-- ============================================================================
-- 1) Per-project scaffold-number counter
-- ============================================================================
create table public.scaffold_number_counters (
  project_id uuid primary key references public.projects (id) on delete cascade,
  next_number integer not null default 1,
  updated_at timestamptz not null default now()
);

comment on table public.scaffold_number_counters is
  'One row per project, tracking the next scaffold_number to allocate — see allocate_scaffold_number() below. No grants to authenticated at all; only ever touched by that SECURITY DEFINER function.';

alter table public.scaffold_number_counters enable row level security;
alter table public.scaffold_number_counters force row level security;

create or replace function public.allocate_scaffold_number(target_project_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next integer;
begin
  insert into public.scaffold_number_counters (project_id, next_number)
  values (target_project_id, 1)
  on conflict (project_id) do nothing;

  update public.scaffold_number_counters
  set next_number = next_number + 1, updated_at = now()
  where project_id = target_project_id
  returning next_number - 1 into v_next;

  return v_next;
end;
$$;

comment on function public.allocate_scaffold_number(uuid) is
  'Atomically allocates the next scaffold_number for target_project_id (concurrency-safe: a single UPDATE ... RETURNING, row-locked by Postgres, never max()/count()). Called only from validate_scaffold_insert()''s BEFORE INSERT trigger below.';

revoke execute on function public.allocate_scaffold_number(uuid) from public;

-- ============================================================================
-- 2) Per-scaffold inspection-sequence counter (same pattern as §1)
-- ============================================================================
create table public.scaffold_inspection_sequence_counters (
  scaffold_id uuid primary key references public.scaffolds (id) on delete cascade,
  next_sequence integer not null default 1,
  updated_at timestamptz not null default now()
);

comment on table public.scaffold_inspection_sequence_counters is
  'One row per scaffold, tracking the next scaffold_inspections.sequence_number to allocate — see allocate_scaffold_inspection_sequence() below. LIFETIME-continuous: never reset, never decremented, even once an inspection is later voided (see the void-workflow migration). No grants to authenticated at all; only ever touched by that SECURITY DEFINER function.';

alter table public.scaffold_inspection_sequence_counters enable row level security;
alter table public.scaffold_inspection_sequence_counters force row level security;

create or replace function public.allocate_scaffold_inspection_sequence(target_scaffold_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next integer;
begin
  insert into public.scaffold_inspection_sequence_counters (scaffold_id, next_sequence)
  values (target_scaffold_id, 1)
  on conflict (scaffold_id) do nothing;

  update public.scaffold_inspection_sequence_counters
  set next_sequence = next_sequence + 1, updated_at = now()
  where scaffold_id = target_scaffold_id
  returning next_sequence - 1 into v_next;

  return v_next;
end;
$$;

comment on function public.allocate_scaffold_inspection_sequence(uuid) is
  'Atomically allocates the next sequence_number for target_scaffold_id (same concurrency-safe UPDATE ... RETURNING technique as allocate_scaffold_number()). Called only from validate_scaffold_inspection_insert()''s BEFORE INSERT trigger below, which stays SECURITY INVOKER — this SECURITY DEFINER allocator is what lets it write the counter without needing any UPDATE grant on scaffolds/scaffold_inspections columns.';

revoke execute on function public.allocate_scaffold_inspection_sequence(uuid) from public;

-- ============================================================================
-- 3) scaffolds.scaffold_number
-- ============================================================================
alter table public.scaffolds add column scaffold_number integer;

-- Backfill existing rows (if any) deterministically per project, oldest
-- first, before the column is locked to NOT NULL — mirrors
-- employee_numbering's backfill-then-lock sequencing.
do $$
declare
  v_project record;
  v_scaffold record;
  v_counter integer;
begin
  for v_project in select distinct project_id from public.scaffolds where scaffold_number is null loop
    v_counter := 1;
    for v_scaffold in
      select id from public.scaffolds
      where project_id = v_project.project_id and scaffold_number is null
      order by created_at asc, id asc
    loop
      update public.scaffolds set scaffold_number = v_counter where id = v_scaffold.id;
      v_counter := v_counter + 1;
    end loop;
    insert into public.scaffold_number_counters (project_id, next_number)
    values (v_project.project_id, v_counter)
    on conflict (project_id) do update set next_number = excluded.next_number;
  end loop;
end;
$$;

alter table public.scaffolds alter column scaffold_number set not null;
alter table public.scaffolds add constraint scaffolds_scaffold_number_positive check (scaffold_number > 0);
alter table public.scaffolds add constraint scaffolds_project_scaffold_number_key unique (project_id, scaffold_number);

comment on column public.scaffolds.scaffold_number is
  'Human-readable sequence number, unique per project (not per company) — auto-allocated by validate_scaffold_insert()''s trigger via allocate_scaffold_number(), never client-supplied (the trigger unconditionally overwrites NEW.scaffold_number regardless of what an insert payload includes). Immutable after creation — see the identity-field guard in validate_scaffold_update() below. Combined with scaffold_inspections.sequence_number for the SI-{scaffold_number}-{sequence_number} display reference — see modules/scaffolds/types.ts''s formatInspectionReference().';

-- ============================================================================
-- 4) Auto-allocate scaffold_number on insert; lock it against later UPDATE
-- ============================================================================
-- Rewritten only to add scaffold_number allocation (as the last statement
-- before `return new`) — the foreman-eligibility check above it is
-- preserved byte-for-byte from the live body
-- (20260806090000_rename_organizations_to_companies.sql).
create or replace function public.validate_scaffold_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.assert_project_not_archived(new.project_id);
  perform public.assert_employee_eligible_for_assignment(new.responsible_foreman_id);
  if not public.is_eligible_scaffold_foreman(new.responsible_foreman_id, new.company_id, new.project_id) then
    raise exception 'employee % is not an eligible Responsible Foreman for this project — must hold the Foreman role and an active Foreman team assignment on this project', new.responsible_foreman_id;
  end if;
  new.scaffold_number := public.allocate_scaffold_number(new.project_id);
  return new;
end;
$$;

-- Rewritten only to add scaffold_number to the identity/creation-field
-- immutability guard — every other check preserved byte-for-byte from the
-- live body (20260806090000_rename_organizations_to_companies.sql, itself
-- the bug-fixed version of 20260803150000's fix — see that migration's
-- header for why the status-change guard is deliberately absent here).
create or replace function public.validate_scaffold_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.project_id is distinct from old.project_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by
    or new.scaffold_number is distinct from old.scaffold_number then
    raise exception 'scaffold identity/creation fields cannot be changed';
  end if;

  if new.responsible_foreman_id is distinct from old.responsible_foreman_id then
    perform public.assert_employee_eligible_for_assignment(new.responsible_foreman_id);
    if not public.is_eligible_scaffold_foreman(new.responsible_foreman_id, new.company_id, new.project_id) then
      raise exception 'employee % is not an eligible Responsible Foreman for this project — must hold the Foreman role and an active Foreman team assignment on this project', new.responsible_foreman_id;
    end if;
  end if;

  return new;
end;
$$;

-- ============================================================================
-- 5) scaffold_inspections.sequence_number
-- ============================================================================
alter table public.scaffold_inspections add column sequence_number integer;

-- Finalized inspections are (deliberately) near-fully immutable —
-- validate_scaffold_inspection_update()'s existing trigger rejects ANY
-- update to a finalized row unless it's specifically setting
-- superseded_by_id (a correction linkage). Populating this brand-new
-- column on already-finalized historical rows is a one-time data-
-- completion operation, not a "modify recorded evidence" edit, so the
-- trigger is disabled for the duration of this single backfill statement
-- only, then immediately re-enabled — it stays fully protective for
-- every real update from this point forward.
alter table public.scaffold_inspections disable trigger scaffold_inspections_validate_update;

do $$
declare
  v_scaffold record;
  v_inspection record;
  v_counter integer;
begin
  for v_scaffold in select id from public.scaffolds loop
    v_counter := 1;
    for v_inspection in
      select id from public.scaffold_inspections
      where scaffold_id = v_scaffold.id and sequence_number is null
      order by created_at asc, id asc
    loop
      update public.scaffold_inspections set sequence_number = v_counter where id = v_inspection.id;
      v_counter := v_counter + 1;
    end loop;
    if v_counter > 1 then
      insert into public.scaffold_inspection_sequence_counters (scaffold_id, next_sequence)
      values (v_scaffold.id, v_counter)
      on conflict (scaffold_id) do update set next_sequence = excluded.next_sequence;
    end if;
  end loop;
end;
$$;

alter table public.scaffold_inspections enable trigger scaffold_inspections_validate_update;

alter table public.scaffold_inspections alter column sequence_number set not null;
alter table public.scaffold_inspections add constraint scaffold_inspections_sequence_number_positive check (sequence_number > 0);
alter table public.scaffold_inspections add constraint scaffold_inspections_scaffold_sequence_number_key unique (scaffold_id, sequence_number);

comment on column public.scaffold_inspections.sequence_number is
  'Lifetime-continuous per-scaffold inspection sequence — allocated by validate_scaffold_inspection_insert()''s trigger via allocate_scaffold_inspection_sequence(). Never resets by date, never reused. Combined with scaffolds.scaffold_number to form the SI-{scaffold_number}-{sequence_number} display reference (modules/scaffolds/types.ts''s formatInspectionReference()) — this column is the durable, uniqueness-bearing value; the formatted string is derived, never stored.';

-- ============================================================================
-- 6) Auto-allocate sequence_number on inspection insert; lock it against
--    later UPDATE
-- ============================================================================
-- Rewritten only to add sequence_number allocation (the last statement
-- before `return new`) — every other check preserved byte-for-byte from
-- the live body (20260803120000_scaffold_inspections.sql), with
-- organization_id renamed to company_id by 20260806090000 (this function
-- never referenced that column directly, so nothing else changes).
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

  -- NEW: lifetime-continuous per-scaffold sequence allocation.
  new.sequence_number := public.allocate_scaffold_inspection_sequence(new.scaffold_id);

  return new;
end;
$$;

-- Rewritten only to add sequence_number to the identity/creation-field
-- immutability guard — every other check preserved byte-for-byte from the
-- live body (20260806090000_rename_organizations_to_companies.sql).
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

  if old.status = 'finalized' then
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

  new.expires_at := now() + make_interval(days => public.resolve_scaffold_inspection_validity_days(new.project_id));
  new.finalized_at := now();
  new.finalized_by := auth.uid();

  return new;
end;
$$;
