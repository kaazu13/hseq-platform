-- Fix: validate_scaffold_update() unconditionally rejected any change to
-- scaffolds.status, including the legitimate write made by
-- sync_scaffold_status_snapshot() (the SECURITY DEFINER trigger on
-- scaffold_inspections that is supposed to be the only writer of this
-- column). A BEFORE UPDATE trigger on scaffolds fires for every UPDATE
-- against the table regardless of which function issued it — SECURITY
-- DEFINER elevates the *sync function's own* privilege checks (RLS,
-- column grants), it does not exempt it from *other* triggers on the
-- table it writes to. So the sync trigger's own UPDATE was being rejected
-- by this guard, and scaffolds.status could never actually change.
--
-- The column is already fully locked against direct client writes via
-- the column-level REVOKE/GRANT below (authenticated has no UPDATE grant
-- on the status column at all — Postgres rejects that at the parser
-- before a trigger ever runs), exactly mirroring how
-- employees.employment_status/start_date/end_date are locked in
-- 20260727090000_employment_periods.sql with no equivalent trigger-level
-- check. This migration removes the redundant, incorrect trigger check
-- and relies solely on the column grant, matching that precedent.
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

  return new;
end;
$$;

comment on function public.validate_scaffold_update() is
  'Guards identity/creation fields only. scaffolds.status is locked to authenticated via column-level GRANT (see the revoke/grant in 20260803120000_scaffold_inspections.sql) rather than a trigger check here, so that sync_scaffold_status_snapshot()''s own SECURITY DEFINER update to this table is not blocked by this trigger.';
