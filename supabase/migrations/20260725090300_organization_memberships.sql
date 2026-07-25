-- organization_memberships — connects a profile to an organization.
-- A person may hold memberships in more than one organization; at most one
-- membership row per (organization_id, user_id) pair. See
-- docs/DATABASE_SCHEMA.md and docs/ARCHITECTURE.md §3.2.

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.membership_status not null default 'invited',
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  constraint organization_memberships_org_user_unique unique (organization_id, user_id)
);

comment on table public.organization_memberships is
  'status is this table''s soft-delete equivalent (removed = no longer a member) — no separate deleted_at column, per docs/ARCHITECTURE.md §9.';

create index organization_memberships_organization_id_idx
  on public.organization_memberships (organization_id, status);
create index organization_memberships_user_id_idx
  on public.organization_memberships (user_id);
create index organization_memberships_created_at_idx
  on public.organization_memberships (created_at);
