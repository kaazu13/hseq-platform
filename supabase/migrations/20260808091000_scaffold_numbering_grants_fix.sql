-- Fix: allocate_scaffold_number()/allocate_scaffold_inspection_sequence()
-- (20260808090000) were created SECURITY DEFINER but never granted EXECUTE
-- to `authenticated` — their only caller, validate_scaffold_insert()/
-- validate_scaffold_inspection_insert(), are SECURITY INVOKER triggers
-- (deliberately unchanged from their existing, already-reviewed trust
-- level), so they execute AS the real authenticated user, meaning
-- `authenticated` itself needs the EXECUTE grant for the call to succeed —
-- unlike allocate_employee_number() (which is called only through a
-- SECURITY DEFINER wrapper, next_employee_number(), and so never needs a
-- direct grant), there is no such wrapper here. The function body itself
-- is authorization-neutral (an atomic counter increment, no data exposure,
-- no bypass of any real access decision — RLS/is_scaffold_manage_tier
-- already gated whether this INSERT was allowed to reach the trigger at
-- all), so a direct grant to authenticated is safe.
grant execute on function public.allocate_scaffold_number(uuid) to authenticated;
grant execute on function public.allocate_scaffold_inspection_sequence(uuid) to authenticated;
