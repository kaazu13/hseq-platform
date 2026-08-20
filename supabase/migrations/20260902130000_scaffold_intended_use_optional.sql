-- Part 4: "Intended use becomes OPTIONAL. Do not require it on create/edit.
-- Historical records remain valid." — the column was `not null` since its
-- introduction; existing rows already have a value so this is a pure
-- relaxation, nothing to backfill.
alter table public.scaffolds alter column intended_use drop not null;
