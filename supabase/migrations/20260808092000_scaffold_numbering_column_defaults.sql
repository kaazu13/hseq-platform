-- Fix: scaffold_number/sequence_number had no column-level DEFAULT, so
-- Supabase's generated TypeScript Insert type marked them REQUIRED —
-- even though validate_scaffold_insert()/validate_scaffold_inspection_insert()
-- always overwrite NEW.scaffold_number/NEW.sequence_number unconditionally
-- before the row is ever written, so the application never includes (and
-- must never include) either field in an insert payload. Adding a
-- placeholder DEFAULT 0 makes both columns optional in the generated
-- Insert type, exactly mirroring scaffolds.status's own
-- "not null default 'pending_inspection'" precedent (also a trigger/sync-
-- only column) — the placeholder value is never actually persisted, since
-- the BEFORE INSERT trigger always replaces it first, and the existing
-- `> 0` check constraints only validate the FINAL written value.
alter table public.scaffolds alter column scaffold_number set default 0;
alter table public.scaffold_inspections alter column sequence_number set default 0;
