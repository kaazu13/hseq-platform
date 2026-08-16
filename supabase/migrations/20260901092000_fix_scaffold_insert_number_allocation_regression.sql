-- ============================================================================
-- Fix a regression introduced by 20260831093000_scaffold_register_v2.sql:
-- its `create or replace function public.validate_scaffold_insert()` was
-- rewritten to add the V2 Foreman self-lock check, but in doing so it
-- dropped `new.scaffold_number := public.allocate_scaffold_number(new.project_id);`
-- (present in the prior body, 20260808090000_scaffold_numbering_and_inspection_reference.sql)
-- without replacing it. scaffold_number has no other source of a valid
-- value — its column default is 0 (20260808092000) and its own check
-- constraint requires > 0 — so EVERY scaffold insert since 20260831093000
-- was applied has been failing with "violates check constraint
-- scaffolds_scaffold_number_positive", regardless of caller/role. Caught
-- live via a direct RLS/trigger attack-test pass (Part 11 of the post-audit
-- implementation package), not by tsc/lint/unit tests, since this is a
-- pure SQL-trigger regression with no TypeScript-visible symptom.
--
-- Fix: re-apply the full, correct trigger body — every V2 addition kept
-- byte-for-byte, scaffold_number allocation restored to its pre-V2
-- position (immediately before the Foreman self-lock check, matching
-- where it always ran relative to the other checks).
-- ============================================================================
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

  -- V2: a caller relying ONLY on the "I am an eligible Foreman myself"
  -- INSERT grant (not a broad creator) may never name anyone else as
  -- Responsible Foreman — server-enforced, independent of whatever the
  -- client sent.
  if not public.is_scaffold_broad_creator(new.company_id, new.project_id) then
    if not exists (
      select 1 from public.employees e
      where e.id = new.responsible_foreman_id
        and e.company_id = new.company_id
        and e.profile_id = auth.uid()
    ) then
      raise exception 'as a Foreman, you can only register a scaffold with yourself as the Responsible Foreman';
    end if;
  end if;

  return new;
end;
$$;
