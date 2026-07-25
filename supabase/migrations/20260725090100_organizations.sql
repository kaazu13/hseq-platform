-- organizations — tenant root. See docs/DATABASE_SCHEMA.md.
--
-- No organization_id column (it IS the tenant root). Created only via a
-- service-role/manual operation for v1 (see supabase/seed.sql) — there is
-- deliberately no authenticated-role INSERT policy on this table yet; see
-- the "Deferred" note in 20260725090900_rls_policies.sql.

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  status public.organization_status not null default 'trial',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint organizations_slug_not_blank check (btrim(slug) <> '')
);

comment on table public.organizations is
  'Tenant root. Every tenant-owned table traces back to exactly one row here.';
comment on column public.organizations.deleted_at is
  'Soft delete only — org offboarding retains data. Set only via a service-role/manual operation in this milestone.';

create unique index organizations_slug_key on public.organizations (slug);
create index organizations_status_idx on public.organizations (status);
create index organizations_created_at_idx on public.organizations (created_at);
