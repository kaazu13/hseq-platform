-- Void workflow for draft scaffold inspections — this codebase's
-- consistent "archive/void/soft-delete over destructive deletion for
-- auditable HSEQ records" design (scaffold_inspections has no DELETE
-- grant at all, same as scaffolds/scaffold_defects). A mistaken or
-- abandoned DRAFT inspection is voided, never deleted; a FINALIZED
-- inspection is already immutable and is never voided — its retirement
-- path is a correction (corrects_inspection_id) or the scaffold itself
-- moving to `closed` via a `closed_dismantled` outcome, both pre-existing.
--
-- sequence_number is deliberately NOT reclaimed when an inspection is
-- voided (see 20260808090000's column comment) — the lifetime-continuous
-- sequence stays continuous even through a voided entry, so
-- "SI-7723-004" always means the same physical inspection event forever,
-- never silently reassigned to a later one.
alter table public.scaffold_inspections
  add column voided_at timestamptz,
  add column voided_by uuid references public.profiles (id) on delete set null,
  add column void_reason text;

alter table public.scaffold_inspections
  add constraint scaffold_inspections_void_only_while_draft check (voided_at is null or status = 'draft'),
  add constraint scaffold_inspections_void_fields_together check ((voided_at is null) = (voided_by is null)),
  add constraint scaffold_inspections_void_reason_required check (voided_at is null or (void_reason is not null and btrim(void_reason) <> ''));

comment on column public.scaffold_inspections.voided_at is
  'Set when a manage-tier user voids a mistaken/abandoned DRAFT inspection — the soft-delete path for this table (no DELETE grant exists). Never set on a finalized inspection (scaffold_inspections_void_only_while_draft); once set, validate_scaffold_inspection_update() treats the row as immutable, same as a finalized one.';
comment on column public.scaffold_inspections.void_reason is
  'Required whenever voided_at is set — same "reason required for an audit-sensitive state change" convention as scaffold_defects.reopen_reason.';

create index scaffold_inspections_voided_at_idx on public.scaffold_inspections (company_id, voided_at) where voided_at is not null;

-- Rewritten only to add the void-workflow branch (immutability guard once
-- voided, and the void transition itself) — every other check preserved
-- byte-for-byte from the live body (20260808090000's rewrite).
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

  -- NEW: once voided, the row is immutable — the same terminal treatment
  -- a finalized inspection gets, checked before anything else so no other
  -- branch below can be used to sneak a change through a voided row.
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

  -- NEW: the void transition itself — draft-only (guaranteed by this
  -- point: old.status = 'finalized' already returned/raised above), a
  -- one-way transition (old.voided_at is null, checked above), and
  -- nothing else may change in the same statement.
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

  new.expires_at := now() + make_interval(days => public.resolve_scaffold_inspection_validity_days(new.project_id));
  new.finalized_at := now();
  new.finalized_by := auth.uid();

  return new;
end;
$$;

-- Callable entry point — mirrors finalize_scaffold_inspection()'s shape
-- (a thin, SECURITY INVOKER wrapper whose UPDATE still goes through RLS/
-- the trigger exactly as a direct update would; this function only
-- validates its own inputs and sets the three void columns atomically).
create or replace function public.void_scaffold_inspection(target_inspection_id uuid, target_void_reason text)
returns public.scaffold_inspections
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_inspection public.scaffold_inspections;
begin
  if target_void_reason is null or btrim(target_void_reason) = '' then
    raise exception 'a reason is required to void a scaffold inspection';
  end if;

  update public.scaffold_inspections
  set voided_at = now(), voided_by = auth.uid(), void_reason = target_void_reason
  where id = target_inspection_id and status = 'draft' and voided_at is null
  returning * into v_inspection;

  if v_inspection is null then
    raise exception 'scaffold inspection % not found, is not a draft, or is already voided', target_inspection_id;
  end if;

  return v_inspection;
end;
$$;

comment on function public.void_scaffold_inspection(uuid, text) is
  'The soft-delete path for a mistaken/abandoned DRAFT scaffold inspection (modules/scaffolds/actions.ts). Still fully gated by scaffold_inspections RLS/validate_scaffold_inspection_update() — this wrapper only bundles the three void columns into one call and gives a clear error for the "already finalized" case instead of a generic constraint-violation message.';

revoke all on function public.void_scaffold_inspection(uuid, text) from public, anon;
grant execute on function public.void_scaffold_inspection(uuid, text) to authenticated;
