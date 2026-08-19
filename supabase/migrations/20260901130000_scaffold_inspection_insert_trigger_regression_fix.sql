-- ============================================================================
-- Regression fix: 20260901125000's rewrite of
-- validate_scaffold_inspection_insert() (adding the new
-- assert_valid_inspection_inspector() call) accidentally dropped two
-- statements that were already live in 20260811090000's version —
-- the closed-scaffold guard and, critically, the
-- `new.sequence_number := allocate_scaffold_inspection_sequence(...)`
-- allocation. Without that allocation, sequence_number kept its column
-- DEFAULT of 0 (20260808092000), which immediately fails the
-- scaffold_inspections_sequence_number_positive check constraint —
-- every new inspection insert has been broken since 20260901125000
-- applied. Restoring both statements; the inspector-lock call added in
-- 20260901125000 is kept as-is.
-- ============================================================================

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
  perform public.assert_valid_inspection_inspector(new.company_id, new.project_id, new.inspector_id);

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

  new.status := 'draft';
  new.outcome := null;
  new.finalized_at := null;
  new.finalized_by := null;
  new.superseded_by_id := null;

  -- Lifetime-continuous per-scaffold sequence allocation (was dropped by
  -- 20260901125000's rewrite — restored here).
  new.sequence_number := public.allocate_scaffold_inspection_sequence(new.scaffold_id);

  return new;
end;
$$;
