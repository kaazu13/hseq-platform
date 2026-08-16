-- Operational audit finding (data-integrity gap): voiding a draft
-- scaffold inspection (void_scaffold_inspection(), 20260810090000) sets
-- voided_at but deliberately leaves status = 'draft' (the void-only-
-- while-draft constraint requires it to stay that way — voiding is not a
-- status transition). validate_scaffold_inspection_update() correctly
-- treats a voided inspection row itself as immutable
-- (`if old.voided_at is not null then raise exception ...`), and
-- 20260811090000_scaffold_stabilization_fixes.sql already closed the
-- exact same gap one level down for scaffold_defects (whose
-- validate_scaffold_defect_insert()/_update() previously never checked
-- the parent inspection's voided_at at all).
--
-- scaffold_inspection_items never got the equivalent fix.
-- assert_scaffold_inspection_is_draft() — the sole guard behind both
-- validate_scaffold_inspection_item_update() and
-- save_scaffold_inspection_items() — only checks `status <> 'draft'`,
-- and a voided inspection's status IS still 'draft' by design, so the
-- check silently passes. Live-confirmed: voiding a draft inspection via
-- void_scaffold_inspection(), then calling
-- save_scaffold_inspection_items() against it, succeeded (changed a
-- checklist item's result/comment) when it should have been rejected —
-- exactly the "voided inspection cannot accidentally be edited"
-- guarantee scaffold_defects already has, missing one level up the same
-- aggregate.
--
-- Fix: mirror the scaffold_defects fix's exact reasoning by extending
-- the ONE shared helper function both scaffold_inspection_items write
-- checks already route through, rather than inventing a second
-- mechanism.
create or replace function public.assert_scaffold_inspection_is_draft(target_inspection_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status public.scaffold_inspection_status;
  v_voided_at timestamptz;
begin
  select status, voided_at into v_status, v_voided_at from public.scaffold_inspections where id = target_inspection_id;
  if v_status is null then
    raise exception 'scaffold inspection % not found', target_inspection_id;
  end if;
  if v_voided_at is not null then
    raise exception 'cannot modify the checklist on a voided scaffold inspection';
  end if;
  if v_status <> 'draft' then
    raise exception 'scaffold inspection % is not a draft (status = %) — the checklist can only be changed while it is a draft', target_inspection_id, v_status;
  end if;
end;
$$;

comment on function public.assert_scaffold_inspection_is_draft(uuid) is
  'Guards scaffold_inspection_items writes (validate_scaffold_inspection_item_update()/save_scaffold_inspection_items()): the parent inspection must exist, must not be voided (voided_at is null — a voided draft keeps status=''draft'' by design, so this is checked separately, not implied by the draft check), and must still be status=''draft''. Mirrors the voided-inspection guard scaffold_defects already has (20260811090000_scaffold_stabilization_fixes.sql).';
