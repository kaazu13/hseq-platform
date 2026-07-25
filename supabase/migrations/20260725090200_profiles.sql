-- profiles — global user identity ONLY (name, phone, active-org preference).
-- No organization_id, no role — those live in organization_memberships /
-- membership_roles. See docs/DATABASE_SCHEMA.md and docs/ARCHITECTURE.md §3.2.
--
-- 1:1 with auth.users, same primary key. Rows are created automatically by
-- the handle_new_user() trigger in 20260725090700_functions_and_triggers.sql
-- — application code never inserts into this table directly.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  phone text,
  active_organization_id uuid references public.organizations (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Global user identity. NOT tenant-owned — a person may belong to multiple organizations.';
comment on column public.profiles.active_organization_id is
  'UX preference only (which org to default into) — NOT a security boundary. Every RLS/authorization decision re-checks organization_memberships regardless of this value.';

create index profiles_active_organization_id_idx on public.profiles (active_organization_id);
