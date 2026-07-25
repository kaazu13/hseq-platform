-- roles — the fixed role catalogue, as an explicit reference table rather
-- than a Postgres enum.
--
-- This supersedes the `user_role` enum design in an earlier revision of
-- docs/DATABASE_SCHEMA.md. A table (over an enum) lets a role carry a
-- human-readable description alongside its slug, and lets membership_roles
-- hold a real foreign key instead of an enum comparison — at the cost of
-- one extra join. All v1 roles are system-defined (is_system = true); the
-- catalogue itself is not organization-configurable (see
-- docs/ROLES_AND_PERMISSIONS.md §1 — the role list is fixed for v1).
-- Seeded in supabase/seed.sql.

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  constraint roles_name_unique unique (name),
  constraint roles_name_not_blank check (btrim(name) <> '')
);

comment on table public.roles is
  'Fixed role catalogue (docs/ROLES_AND_PERMISSIONS.md §1). Not organization-configurable in v1 — seeded once via supabase/seed.sql, not writable by application roles.';
