-- First-owner bootstrap mechanism — see docs/FIRST_ADMIN_BOOTSTRAP.md for
-- the full explanation and invocation instructions.
--
-- Problem: every write path that grants an organization role
-- (membership_roles_insert_managers, 20260725091200_membership_roles_management.sql)
-- requires the CALLER to already hold company_admin/operations_manager in
-- that organization. That is correct and intentional for ongoing role
-- management, but it means a BRAND NEW organization with literally zero
-- role holders has no self-service way for its intended first owner to
-- become company_admin — a genuine chicken-and-egg gap, not a bug in the
-- existing policies.
--
-- This migration adds ONE narrow, audited escape hatch for exactly that
-- cold-start case:
--   - bootstrap_first_owner(target_organization_id, target_user_id, notes)
--     is SECURITY DEFINER, but is NEVER granted to `authenticated` or
--     `anon` — only to `service_role`. It cannot be called by any logged-in
--     application user, ever, at any privilege level, including an
--     existing company_admin. It is only reachable via a service-role
--     script/migration, i.e. by whoever operates the platform.
--   - It refuses to run at all if the target organization ALREADY has an
--     active company_admin membership — "bootstrap the FIRST owner" is
--     exactly what it does and nothing more; onboarding a SECOND admin, or
--     changing an existing one, must go through the normal
--     membership_roles_insert_managers path (which is what every ongoing
--     admin-management task already uses safely).
--   - Every invocation is recorded in `bootstrap_audit_log` — who
--     (the target user), which organization, when, and a free-text `notes`
--     field for who/why performed it (e.g. "platform operator, one-off
--     onboarding script, 2026-08-04").
--   - Nothing about this function is keyed to an email address or any
--     other hardcoded identity — target_user_id is a parameter, resolved
--     by whoever invokes it (typically by looking up an email in
--     auth.users at invocation time, OUTSIDE this function, never inside
--     an authorization check).
--
-- This directly satisfies "no public signup should automatically receive
-- admin rights" (the function is unreachable from any public-facing
-- code path) and "no email address should be permanently trusted in
-- application code" (no email appears anywhere in this migration).

create table public.bootstrap_audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_assigned text not null,
  performed_at timestamptz not null default now(),
  notes text
);

comment on table public.bootstrap_audit_log is
  'Append-only record of every bootstrap_first_owner() invocation — who was made the first owner of which organization, when, and why. See docs/FIRST_ADMIN_BOOTSTRAP.md.';

alter table public.bootstrap_audit_log enable row level security;
alter table public.bootstrap_audit_log force row level security;

-- Readable by company_admin/operations_manager of the organization it
-- concerns (same reader set as audit_events) — auditable, not secret.
-- Never writable by `authenticated` at all — only bootstrap_first_owner()
-- itself (SECURITY DEFINER) ever inserts a row.
grant select on public.bootstrap_audit_log to authenticated;

create policy bootstrap_audit_log_select
  on public.bootstrap_audit_log
  for select
  to authenticated
  using (public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager']));

create or replace function public.bootstrap_first_owner(target_organization_id uuid, target_user_id uuid, notes text default null)
returns public.organization_memberships
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_admin_role_id uuid;
  v_existing_admin_count int;
  v_membership public.organization_memberships;
begin
  if not exists (select 1 from public.organizations where id = target_organization_id) then
    raise exception 'organization % not found', target_organization_id;
  end if;
  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'user % not found', target_user_id;
  end if;

  select count(*) into v_existing_admin_count
  from public.membership_roles mr
  join public.roles r on r.id = mr.role_id
  join public.organization_memberships m on m.id = mr.membership_id
  where mr.organization_id = target_organization_id
    and r.name = 'company_admin'
    and m.status = 'active';

  if v_existing_admin_count > 0 then
    raise exception 'organization % already has an active company_admin — bootstrap_first_owner() only handles the cold-start case; use the normal membership_roles management path (a real company_admin assigning the role) instead', target_organization_id;
  end if;

  select id into v_company_admin_role_id from public.roles where name = 'company_admin';
  if v_company_admin_role_id is null then
    raise exception 'company_admin role not found in the roles catalogue';
  end if;

  insert into public.organization_memberships (organization_id, user_id, status, joined_at)
  values (target_organization_id, target_user_id, 'active', now())
  on conflict (organization_id, user_id) do update set status = 'active', joined_at = coalesce(public.organization_memberships.joined_at, now())
  returning * into v_membership;

  insert into public.membership_roles (organization_id, membership_id, role_id)
  values (target_organization_id, v_membership.id, v_company_admin_role_id)
  on conflict (membership_id, role_id) do nothing;

  insert into public.bootstrap_audit_log (organization_id, user_id, role_assigned, notes)
  values (target_organization_id, target_user_id, 'company_admin', notes);

  return v_membership;
end;
$$;

comment on function public.bootstrap_first_owner(uuid, uuid, text) is
  'Onboards an organization''s FIRST company_admin — refuses to run if one already exists. service_role only, never granted to authenticated/anon. See docs/FIRST_ADMIN_BOOTSTRAP.md.';

revoke all on function public.bootstrap_first_owner(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.bootstrap_first_owner(uuid, uuid, text) to service_role;
