-- membership_roles — a membership can carry more than one role (a separate
-- row per role, not a single column) — see docs/DATABASE_SCHEMA.md and
-- docs/ARCHITECTURE.md §6 (permissions are the union of a membership's roles).

create table public.membership_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  membership_id uuid not null references public.organization_memberships (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint membership_roles_membership_role_unique unique (membership_id, role_id)
);

comment on table public.membership_roles is
  'organization_id is denormalized from the parent membership for RLS simplicity/performance — avoids a join through organization_memberships in every policy.';
comment on column public.membership_roles.role_id is
  'ON DELETE RESTRICT — a role in active use cannot be removed from the catalogue out from under existing assignments.';

create index membership_roles_membership_id_idx on public.membership_roles (membership_id);
create index membership_roles_organization_id_idx on public.membership_roles (organization_id);
create index membership_roles_role_id_idx on public.membership_roles (role_id);
