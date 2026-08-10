-- Stabilization fix (post Phase 0-7 audit), part 1: a closed/dismantled
-- scaffold (scaffolds.status = 'closed', reached via a finalized
-- closed_dismantled outcome) could still receive a brand-new inspection —
-- nothing at any layer checked for this. A closed scaffold is retired;
-- re-inspecting it makes no more sense than re-inspecting a scaffold that
-- was never registered. This is the authoritative, database-level guard;
-- the "New inspection" button/route also stop offering it once closed
-- (see the app-layer changes in this same stabilization pass), but the
-- trigger is what actually prevents it regardless of UI state.
--
-- A CORRECTION (corrects_inspection_id set) is deliberately exempt — it's
-- the one legitimate way to fix a mistaken closed_dismantled outcome
-- itself (e.g. a scaffold was closed by mistake), and blocking it here
-- would make that mistake permanently uncorrectable.
create or replace function public.validate_scaffold_inspection_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_previous_scaffold_id uuid;
  v_corrects_status public.scaffold_inspection_status;
  v_scaffold_status public.scaffold_status;
begin
  if new.corrects_inspection_id is null then
    select status into v_scaffold_status from public.scaffolds where id = new.scaffold_id;
    if v_scaffold_status = 'closed' then
      raise exception 'cannot record a new inspection for a closed/dismantled scaffold';
    end if;
  end if;

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

  -- Lifetime-continuous per-scaffold sequence allocation.
  new.sequence_number := public.allocate_scaffold_inspection_sequence(new.scaffold_id);

  return new;
end;
$$;

-- Stabilization fix, part 2: a scaffold defect could still
-- be CREATED against, or MODIFIED on, a scaffold inspection that had
-- already been voided — validate_scaffold_defect_insert()/_update() never
-- checked the parent inspection's voided_at at all. The inspection row
-- itself is correctly immutable once voided
-- (validate_scaffold_inspection_update(), 20260810090000), but its
-- defects were not, which meant a voided (mistaken/abandoned) draft's
-- defect list could still silently grow or change after the fact —
-- exactly the "voided inspection cannot accidentally be edited" guarantee
-- this fixes, just one level down the aggregate. A voided inspection's
-- defects are now frozen at whatever they were the moment it was voided,
-- the same terminal treatment scaffold_inspections itself already gets.
create or replace function public.validate_scaffold_defect_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_inspection_voided_at timestamptz;
begin
  perform public.assert_project_not_archived(new.project_id);
  perform public.assert_employee_eligible_for_assignment(new.responsible_person_id);
  if new.inspection_item_id is not null then
    if not exists (select 1 from public.scaffold_inspection_items i where i.id = new.inspection_item_id and i.scaffold_inspection_id = new.scaffold_inspection_id) then
      raise exception 'inspection_item_id must belong to the same inspection';
    end if;
  end if;

  select voided_at into v_inspection_voided_at from public.scaffold_inspections where id = new.scaffold_inspection_id;
  if v_inspection_voided_at is not null then
    raise exception 'cannot add a defect to a voided scaffold inspection';
  end if;

  return new;
end;
$$;

-- Rewritten only to add the voided-inspection guard (first check in the
-- body) — every other rule preserved byte-for-byte from the live body
-- (20260806090000_rename_organizations_to_companies.sql).
create or replace function public.validate_scaffold_defect_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_inspection_voided_at timestamptz;
begin
  select voided_at into v_inspection_voided_at from public.scaffold_inspections where id = old.scaffold_inspection_id;
  if v_inspection_voided_at is not null then
    raise exception 'cannot modify a defect on a voided scaffold inspection';
  end if;

  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.scaffold_inspection_id is distinct from old.scaffold_inspection_id
    or new.scaffold_id is distinct from old.scaffold_id
    or new.project_id is distinct from old.project_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'scaffold defect identity/creation fields cannot be changed';
  end if;

  if not public.is_scaffold_manage_tier(new.company_id, new.project_id) then
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

  if (new.status in ('closed', 'rejected') and old.status not in ('closed', 'rejected'))
    or (old.status in ('closed', 'rejected') and new.status not in ('closed', 'rejected')) then
    if not public.can_close_scaffold_defect(new.company_id, new.project_id, new.created_by, new.responsible_person_id) then
      raise exception 'you do not have authority to close, reject, or reopen this scaffold defect';
    end if;
  end if;

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
