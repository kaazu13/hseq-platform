-- audit_events — append-only, immutable audit trail.
--
-- Named audit_events per this milestone's explicit scope (the earlier
-- docs/DATABASE_SCHEMA.md revision called this table audit_logs — see the
-- documentation update landing alongside this migration for the rename).
--
-- Immutability is enforced twice, deliberately redundantly:
--   1. No UPDATE/DELETE RLS policy is ever granted (20260725090900_rls_policies.sql).
--   2. A hard trigger (20260725090700_functions_and_triggers.sql) rejects
--      UPDATE/DELETE unconditionally, for every role — including
--      service_role/postgres, which bypass RLS entirely and would
--      otherwise be able to alter history via a compromised or buggy
--      server-side script.

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  actor_user_id uuid references public.profiles (id) on delete set null,
  action public.audit_action not null,
  entity_type text not null,
  entity_id uuid not null,
  changes jsonb,
  ip_address inet,
  created_at timestamptz not null default now(),
  constraint audit_events_entity_type_not_blank check (btrim(entity_type) <> '')
);

comment on table public.audit_events is
  'Append-only. organization_id/actor_user_id use ON DELETE SET NULL (not CASCADE) so a rare hard delete elsewhere never silently deletes audit evidence.';

create index audit_events_organization_id_idx
  on public.audit_events (organization_id, created_at desc);
create index audit_events_entity_idx
  on public.audit_events (entity_type, entity_id);
create index audit_events_actor_user_id_idx
  on public.audit_events (actor_user_id);
create index audit_events_created_at_idx
  on public.audit_events (created_at);
