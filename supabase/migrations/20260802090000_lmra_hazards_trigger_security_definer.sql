-- Fix: create_initial_lmra_hazards() (20260801090000_lmra.sql) was declared
-- SECURITY INVOKER, but lmra_hazards deliberately has no INSERT policy for
-- `authenticated` (the original migration's own comment reasoned "no policy
-- means insert is structurally impossible for authenticated, which is
-- fine — only the trigger inserts here"). That reasoning missed that a
-- SECURITY INVOKER trigger fired by a real authenticated user's INSERT into
-- lmra_assessments still runs its own lmra_hazards insert AS THAT USER,
-- subject to lmra_hazards' RLS — so with no INSERT policy at all, RLS
-- rejects the trigger's own insert and the entire lmra_assessments insert
-- rolls back with it. Confirmed via a real per-user session in manual
-- verification (a service-role/superuser test transaction earlier had
-- bypassed RLS entirely and missed this).
--
-- Fix: SECURITY DEFINER, same as every other trigger in this codebase that
-- needs to write a controlled, fixed shape into a second table beyond what
-- the calling user's own RLS grants would allow (e.g.
-- employees_create_initial_period() in 20260727090000_employment_periods.sql).
-- The function's own body is unchanged and still only inserts the fixed
-- 12-row enum-derived set tied to NEW.id — there is no user-controlled input
-- here for SECURITY DEFINER to expose.
create or replace function public.create_initial_lmra_hazards()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.lmra_hazards (organization_id, lmra_assessment_id, hazard_type)
  select new.organization_id, new.id, unnest(enum_range(null::public.lmra_hazard_type));
  return new;
end;
$$;
