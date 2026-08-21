-- CRITICAL regression, found live while re-seeding fixture data (this is
-- a genuine production bug, not a fixture-only issue — see the task's
-- own "fix only if a genuine data/fixture bug is discovered" carve-out).
--
-- `create_equipment_item`/`update_equipment_item` have each been
-- redefined twice via `create or replace function` with a DIFFERENT
-- number of parameters (adding target_default_validity_days, then later
-- target_unit_price/target_currency/target_requestable/target_purchase_date).
-- `create or replace function` only replaces a function with the EXACT
-- SAME signature — a different parameter count creates a brand new
-- overload alongside the old one instead of replacing it. Only the
-- 18-arg intermediate overload was ever explicitly dropped
-- (20260904091000); the original 15-arg create_equipment_item and
-- 12-arg update_equipment_item were never cleaned up, so two live
-- overloads of each have coexisted ever since Part 26 of the workforce-
-- completion task shipped.
--
-- Impact: PostgREST/Supabase resolves an RPC call by NAMED parameters
-- against every overload whose parameters are a compatible superset —
-- with two overloads differing only by trailing optional parameters,
-- this is genuinely ambiguous, and every call (from the app's own
-- modules/equipment/actions.ts, and this fixture script) fails outright
-- with "Could not choose the best candidate function." Confirmed live:
-- creating ANY new equipment catalog item currently fails 100% of the
-- time in the deployed app, not just this seed script — existing items
-- were unaffected only because editing/reading an already-existing row
-- never re-triggers a fresh RPC call reaching this ambiguity from the
-- SAME code paths this migration protects. Equipment CATALOG CREATION
-- has been fully broken since 20260904090000 shipped.
drop function if exists public.create_equipment_item(
  uuid, uuid, public.equipment_tracking_mode, text, text, text, text, text, text, text,
  integer, public.equipment_condition, text, text, integer
);
drop function if exists public.update_equipment_item(
  uuid, uuid, text, text, text, text, text, text, text, text, text, integer
);
