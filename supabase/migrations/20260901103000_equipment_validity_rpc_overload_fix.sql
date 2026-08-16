-- Fixes a real bug in 20260901101000_equipment_validity_rpcs.sql, caught
-- by live testing: `create or replace function` only replaces a function
-- whose PARAMETER TYPE LIST matches exactly. Adding new trailing
-- parameters to create_equipment_item/update_equipment_item/issue_equipment
-- did NOT replace the original (pre-Part-7) signatures — it created a
-- SECOND overload alongside them, so PostgREST could no longer pick a
-- single candidate for `.rpc()` calls and every call failed with
-- PGRST203 "Could not choose the best candidate function". Never edit an
-- already-applied migration (20260901101000) — this is the forward-only
-- fix: explicitly drop the old, now-orphaned signatures. The 20260901101000
-- migration's `create or replace function ...(<new 15/12/10-arg
-- signature>)` calls already created the correct, currently-desired
-- versions — this migration only removes their stale siblings.
drop function if exists public.create_equipment_item(uuid, uuid, public.equipment_tracking_mode, text, text, text, text, text, text, text, integer, public.equipment_condition, text, text);
drop function if exists public.update_equipment_item(uuid, uuid, text, text, text, text, text, text, text, text, text);
drop function if exists public.issue_equipment(uuid, uuid, integer, public.equipment_condition, date, date, text, uuid);
