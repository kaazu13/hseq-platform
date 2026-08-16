-- Post-audit implementation package, Part 3 — Roles & Permissions
-- foundation. Explicit scope decision, documented per the governing
-- instruction's own escape hatch ("if implementing fully dynamic custom
-- roles would require an unsafe wholesale rewrite of audited
-- authorization logic, implement a compatibility-preserving foundation
-- and UI that can be safely extended, and clearly document any remaining
-- staged migration"):
--
-- The 11 existing system roles (roles.is_system = true, seeded in
-- supabase/seed.sql) are enforced EXCLUSIVELY by ~40+ existing RLS
-- policies and modules/*/permissions.ts files doing literal string
-- comparisons against role names (has_company_role/has_any_company_role,
-- taking role-name text/text[] directly) — confirmed by inspection before
-- writing this migration. NONE of that is touched here. Rewriting every
-- one of those call sites to consult a dynamic permission model instead
-- would be exactly the "unsafe wholesale rewrite" the instruction warns
-- against, on a system that was just extensively audited.
--
-- What this migration DOES build, safely and additively:
--   1) roles.company_id (nullable) — null means "system role" (unchanged
--      meaning), set means "custom role scoped to that one company." The
--      SAME roles table, SAME membership_roles FK, no parallel hierarchy.
--   2) permissions — a fixed, seeded catalogue of permission keys across
--      the domains the instruction lists (scaffold, scaffold_inspections,
--      today_teams, attendance, worked_hours, lmra, observations,
--      corrective_actions, equipment, employees, projects, reporting,
--      company_admin), each with a scope_type (company_wide/
--      project_specific/either).
--   3) role_permissions — role_id -> permission_id grants. Seeded for
--      all 11 system roles too (a best-effort, documented mirror of their
--      REAL current behavior, derived from modules/*/permissions.ts and
--      the matching RLS policies) — this makes the model correct and
--      queryable for system roles from day one, not just custom ones.
--   4) has_company_permission(company_id, permission_key) — a NEW,
--      correct, SECURITY DEFINER helper checking role_permissions for
--      ANY role (system or custom) the caller holds. Available for new
--      code to consult going forward. NOT wired into any existing RLS
--      policy or modules/*/permissions.ts check in this migration — doing
--      so for the operational modules (Scaffold Register, LMRA, etc.) is
--      the explicitly-deferred staged migration, called out in the final
--      report, not attempted here.
--   5) Protection: system roles (is_system = true) can never be deleted,
--      never have is_system flipped, and never have company_id set. Only
--      a platform_super_admin can create/edit a custom role or its
--      permission grants — an ordinary company_admin has no path to
--      create or escalate one for themselves. Reserved/system permission
--      keys (see below) can never be granted to a custom role at all.
--      Every create/edit/assign is audited.

-- ============================================================================
-- 1) roles.company_id
-- ============================================================================
alter table public.roles add column company_id uuid references public.companies (id) on delete cascade;
alter table public.roles add constraint roles_system_never_company_scoped check (not (is_system and company_id is not null));

comment on column public.roles.company_id is
  'NULL for the 11 fixed system roles (unchanged v1 meaning). Set for a company-scoped CUSTOM role (Part 3 of the post-audit implementation package) — that company''s Platform-Admin-defined role, built from explicit permission grants (role_permissions), never a free-text label checked ad hoc. A custom role''s name is unique only within its own company, never global.';

alter table public.roles drop constraint if exists roles_name_unique;
create unique index roles_name_unique on public.roles (name) where company_id is null;
create unique index roles_company_name_unique on public.roles (company_id, name) where company_id is not null;

-- RLS: everyone can read the system catalogue (unchanged — no RLS existed
-- before; roles was effectively public-readable-by-anyone-with-a-session
-- via the absence of a policy under force-RLS-off). Force RLS on now that
-- custom rows carry real company-scoped data.
alter table public.roles enable row level security;
alter table public.roles force row level security;
grant select on public.roles to authenticated;

create policy roles_select
  on public.roles
  for select
  to authenticated
  using (
    is_system
    or public.is_platform_super_admin()
    or public.is_company_member(company_id)
  );

-- No direct INSERT/UPDATE/DELETE grant to authenticated at all — every
-- mutation goes through the SECURITY DEFINER RPCs below, which enforce
-- platform_super_admin-only + system-role protection + reserved-permission
-- checks in one place rather than trusting a row-level policy alone for
-- something this security-sensitive.

-- ============================================================================
-- 2) permissions — fixed catalogue, not company-configurable (same
--    "fixed for v1" precedent as roles itself)
-- ============================================================================
create type public.permission_scope_type as enum ('company_wide', 'project_specific', 'either');

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  domain text not null,
  label text not null,
  description text,
  scope_type public.permission_scope_type not null default 'either',
  -- Reserved permissions can never be granted to a CUSTOM role — they
  -- correspond to system-role-only capabilities (company administration
  -- itself, role/permission management) that would otherwise let a
  -- custom role holder self-escalate or manage other companies' access.
  is_reserved boolean not null default false,
  created_at timestamptz not null default now(),
  constraint permissions_key_unique unique (key),
  constraint permissions_key_not_blank check (btrim(key) <> ''),
  constraint permissions_key_format check (key ~ '^[a-z_]+\.[a-z_]+$')
);

comment on table public.permissions is
  'Fixed permission-key catalogue (Part 3) — mirrors roles'' own "fixed for v1, not organization-configurable" precedent. key is "{domain}.{action}", e.g. "scaffold.create". Seeded below; not writable by any role, including platform_super_admin, in this migration (a genuinely new permission key is a schema change, same as a genuinely new system role always has been).';

alter table public.permissions enable row level security;
alter table public.permissions force row level security;
grant select on public.permissions to authenticated;

create policy permissions_select
  on public.permissions
  for select
  to authenticated
  using (true);

insert into public.permissions (key, domain, label, description, scope_type, is_reserved) values
  ('scaffold.view', 'scaffold', 'View Scaffold Register', 'View scaffolds and their inspection history.', 'project_specific', false),
  ('scaffold.create', 'scaffold', 'Register scaffolds', 'Create/register new scaffolds.', 'project_specific', false),
  ('scaffold.edit', 'scaffold', 'Edit scaffolds', 'Edit an existing scaffold''s details.', 'project_specific', false),
  ('scaffold.archive', 'scaffold', 'Archive/close scaffolds', 'Retire a scaffold from active use.', 'project_specific', false),
  ('scaffold_inspections.view', 'scaffold_inspections', 'View scaffold inspections', 'View scaffold inspection reports.', 'project_specific', false),
  ('scaffold_inspections.create', 'scaffold_inspections', 'Create scaffold inspections', 'Start a new scaffold inspection.', 'project_specific', false),
  ('scaffold_inspections.finalize', 'scaffold_inspections', 'Finalize scaffold inspections', 'Finalize/approve a scaffold inspection outcome.', 'project_specific', false),
  ('today_teams.view', 'today_teams', 'View Today''s Teams', 'View the daily team roster.', 'project_specific', false),
  ('today_teams.manage', 'today_teams', 'Manage Today''s Teams', 'Create/edit/lock daily teams and their rosters.', 'project_specific', false),
  ('attendance.view', 'attendance', 'View attendance', 'View daily attendance records.', 'project_specific', false),
  ('attendance.manage', 'attendance', 'Manage attendance', 'Confirm absences, approve leave, correct attendance status.', 'project_specific', false),
  ('worked_hours.view', 'worked_hours', 'View worked hours', 'View worked-hours records.', 'project_specific', false),
  ('worked_hours.manage', 'worked_hours', 'Manage worked hours', 'Enter/edit worked-hours categories for others.', 'project_specific', false),
  ('worked_hours.submit', 'worked_hours', 'Submit worked hours', 'Submit a day''s worked hours.', 'project_specific', false),
  ('worked_hours.correct', 'worked_hours', 'Correct submitted worked hours', 'Correct already-submitted worked hours with a reason.', 'project_specific', false),
  ('lmra.view', 'lmra', 'View LMRAs', 'View Last Minute Risk Assessments.', 'project_specific', false),
  ('lmra.create', 'lmra', 'Create LMRAs', 'Complete a new LMRA.', 'project_specific', false),
  ('lmra.manage', 'lmra', 'Manage LMRAs', 'Archive/manage other people''s LMRAs.', 'project_specific', false),
  ('observations.view', 'observations', 'View safety observations', 'View HSE observations.', 'project_specific', false),
  ('observations.create', 'observations', 'Create safety observations', 'Record a new HSE observation.', 'project_specific', false),
  ('observations.manage', 'observations', 'Manage safety observations', 'Close/manage observations.', 'project_specific', false),
  ('corrective_actions.view', 'corrective_actions', 'View corrective actions', 'View corrective actions.', 'project_specific', false),
  ('corrective_actions.create', 'corrective_actions', 'Create corrective actions', 'Raise a new corrective action.', 'project_specific', false),
  ('corrective_actions.manage', 'corrective_actions', 'Manage corrective actions', 'Progress/close corrective actions.', 'project_specific', false),
  ('equipment.view', 'equipment', 'View equipment', 'View the equipment register and requests.', 'either', false),
  ('equipment.manage', 'equipment', 'Manage equipment', 'Issue/return/approve equipment requests.', 'either', false),
  ('employees.view', 'employees', 'View employees', 'View the employee roster.', 'company_wide', false),
  ('employees.manage', 'employees', 'Manage employees', 'Create/edit employees and their assignments.', 'company_wide', false),
  ('projects.view', 'projects', 'View projects', 'View project details.', 'company_wide', false),
  ('projects.manage', 'projects', 'Manage projects', 'Create/edit projects.', 'company_wide', false),
  ('reporting.export', 'reporting', 'Export reports', 'Export XLSX/PDF reports.', 'either', false),
  -- Reserved — never grantable to a custom role (self-escalation guard).
  ('company_admin.manage', 'company_admin', 'Company administration', 'Manage company settings, memberships, and roles — reserved, system-role only.', 'company_wide', true),
  ('roles.manage', 'company_admin', 'Manage custom roles', 'Create/edit custom roles and their permission grants — reserved, platform-admin only.', 'company_wide', true);

-- ============================================================================
-- 3) role_permissions
-- ============================================================================
create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint role_permissions_unique unique (role_id, permission_id)
);

comment on table public.role_permissions is
  'Which permissions a role (system or custom) grants. Seeded below for all 11 system roles as a best-effort, documented mirror of their REAL existing behavior (modules/*/permissions.ts + matching RLS) — informational/queryable via has_company_permission(), not itself the enforcement mechanism for system roles (their existing RLS/permissions.ts stays authoritative and unchanged). For custom roles, this table IS the actual grant record, settable only via manage_custom_role_permissions() below.';

create index role_permissions_role_id_idx on public.role_permissions (role_id);
create index role_permissions_permission_id_idx on public.role_permissions (permission_id);

alter table public.role_permissions enable row level security;
alter table public.role_permissions force row level security;
grant select on public.role_permissions to authenticated;

create policy role_permissions_select
  on public.role_permissions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and (r.is_system or public.is_platform_super_admin() or public.is_company_member(r.company_id))
    )
  );

-- Best-effort seed of system-role permission grants, derived from the
-- current, audited modules/*/permissions.ts + RLS behavior at the time of
-- writing. NOT authoritative — see this migration's header comment — and
-- deliberately excludes company_admin/roles.manage's reserved keys.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.company_id is null
  and (
    (r.name = 'company_admin' and p.key not in ('roles.manage'))
    or (r.name = 'operations_manager' and p.key in ('employees.view', 'employees.manage', 'projects.view', 'today_teams.view', 'today_teams.manage', 'attendance.view', 'attendance.manage', 'worked_hours.view', 'worked_hours.manage', 'reporting.export'))
    or (r.name = 'project_manager' and p.key in ('projects.view', 'projects.manage', 'today_teams.view', 'today_teams.manage', 'attendance.view', 'attendance.manage', 'worked_hours.view', 'worked_hours.manage', 'worked_hours.correct', 'lmra.view', 'observations.view', 'corrective_actions.view', 'scaffold.view', 'scaffold.create', 'scaffold_inspections.view', 'equipment.view', 'equipment.manage', 'reporting.export'))
    or (r.name = 'hseq_manager' and p.key in ('lmra.view', 'lmra.manage', 'observations.view', 'observations.create', 'observations.manage', 'corrective_actions.view', 'corrective_actions.create', 'corrective_actions.manage', 'scaffold.view', 'scaffold_inspections.view', 'reporting.export'))
    or (r.name = 'hse_officer' and p.key in ('lmra.view', 'observations.view', 'observations.create', 'corrective_actions.view', 'corrective_actions.create', 'scaffold.view', 'scaffold_inspections.view', 'scaffold_inspections.create'))
    or (r.name = 'foreman' and p.key in ('today_teams.view', 'attendance.view', 'worked_hours.view', 'lmra.view', 'lmra.create', 'observations.view', 'observations.create', 'scaffold.view', 'scaffold.create', 'equipment.view'))
    or (r.name = 'inspector' and p.key in ('scaffold.view', 'scaffold_inspections.view', 'scaffold_inspections.create', 'scaffold_inspections.finalize', 'corrective_actions.view', 'corrective_actions.create'))
    or (r.name = 'planner' and p.key in ('today_teams.view', 'today_teams.manage', 'attendance.view', 'projects.view'))
    or (r.name = 'employee' and p.key in ('today_teams.view', 'attendance.view', 'worked_hours.view', 'worked_hours.submit', 'lmra.view', 'lmra.create', 'observations.view', 'equipment.view'))
  );

-- ============================================================================
-- 4) has_company_permission — the new, correct, forward-looking check.
--    NOT consulted by any existing RLS policy in this migration.
-- ============================================================================
create or replace function public.has_company_permission(target_company_id uuid, target_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.membership_roles mr
    join public.company_memberships m on m.id = mr.membership_id
    join public.role_permissions rp on rp.role_id = mr.role_id
    join public.permissions p on p.id = rp.permission_id
    where mr.company_id = target_company_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and p.key = target_permission_key
  );
$$;

comment on function public.has_company_permission(uuid, text) is
  'True if the caller holds ANY role (system or custom) in target_company_id that grants target_permission_key, via role_permissions. New, forward-looking helper (Part 3) — available for new code to consult; NOT wired into any existing RLS policy or modules/*/permissions.ts check as of this migration (see this migration''s header comment for why that is an explicit, deferred, staged decision, not an oversight).';

revoke all on function public.has_company_permission(uuid, text) from public, anon;
grant execute on function public.has_company_permission(uuid, text) to authenticated;

-- ============================================================================
-- 5) Custom role management RPCs — platform_super_admin only, audited,
--    reserved-permission-safe.
-- ============================================================================
create or replace function public.create_custom_role(
  target_company_id uuid,
  target_name text,
  target_description text,
  target_permission_keys text[]
)
returns public.roles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.roles;
  v_clean_name text;
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator can create a custom role';
  end if;
  if not exists (select 1 from public.companies where id = target_company_id) then
    raise exception 'company % not found', target_company_id;
  end if;

  v_clean_name := btrim(coalesce(target_name, ''));
  if v_clean_name = '' then
    raise exception 'a role name is required';
  end if;
  if char_length(v_clean_name) > 100 then
    raise exception 'role name is too long (max 100 characters)';
  end if;
  if target_description is not null and char_length(target_description) > 500 then
    raise exception 'role description is too long (max 500 characters)';
  end if;
  if exists (select 1 from public.roles where name = v_clean_name and company_id is null) then
    raise exception 'a system role already uses the name "%"', v_clean_name;
  end if;

  -- Reserved permissions can never be granted to a custom role — the
  -- self-escalation guard. Checked before any row is written.
  if exists (
    select 1 from public.permissions
    where key = any (target_permission_keys) and is_reserved
  ) then
    raise exception 'one or more selected permissions are reserved and cannot be granted to a custom role';
  end if;
  if exists (
    select 1 from unnest(target_permission_keys) k
    where not exists (select 1 from public.permissions where key = k)
  ) then
    raise exception 'one or more selected permissions are not recognized';
  end if;

  insert into public.roles (name, description, is_system, company_id)
  values (v_clean_name, target_description, false, target_company_id)
  returning * into v_role;

  insert into public.role_permissions (role_id, permission_id, created_by)
  select v_role.id, p.id, auth.uid()
  from public.permissions p
  where p.key = any (target_permission_keys);

  insert into public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, changes)
  values (target_company_id, auth.uid(), 'create', 'custom_role', v_role.id, jsonb_build_object('name', v_clean_name, 'permission_keys', target_permission_keys));

  return v_role;
end;
$$;

comment on function public.create_custom_role(uuid, text, text, text[]) is
  'Platform Super Admin-only. Creates a company-scoped custom role from an explicit permission-key list — never reserved permissions, never a free-text/unchecked name. Audited.';

revoke all on function public.create_custom_role(uuid, text, text, text[]) from public, anon;
grant execute on function public.create_custom_role(uuid, text, text, text[]) to authenticated;

create or replace function public.update_custom_role_permissions(
  target_role_id uuid,
  target_permission_keys text[]
)
returns public.roles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.roles;
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator can edit a custom role';
  end if;

  select * into v_role from public.roles where id = target_role_id;
  if v_role.id is null then
    raise exception 'role % not found', target_role_id;
  end if;
  if v_role.is_system then
    raise exception 'system roles cannot be edited — their permissions are fixed by the audited application logic';
  end if;

  if exists (
    select 1 from public.permissions
    where key = any (target_permission_keys) and is_reserved
  ) then
    raise exception 'one or more selected permissions are reserved and cannot be granted to a custom role';
  end if;
  if exists (
    select 1 from unnest(target_permission_keys) k
    where not exists (select 1 from public.permissions where key = k)
  ) then
    raise exception 'one or more selected permissions are not recognized';
  end if;

  delete from public.role_permissions where role_id = target_role_id;
  insert into public.role_permissions (role_id, permission_id, created_by)
  select target_role_id, p.id, auth.uid()
  from public.permissions p
  where p.key = any (target_permission_keys);

  insert into public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, changes)
  values (v_role.company_id, auth.uid(), 'update', 'custom_role', v_role.id, jsonb_build_object('permission_keys', target_permission_keys));

  return v_role;
end;
$$;

comment on function public.update_custom_role_permissions(uuid, text[]) is
  'Platform Super Admin-only. Replaces a custom role''s entire permission grant set atomically (delete + re-insert, same discipline as update_lmra_assessment()''s participant sync) — never reserved permissions. Rejects any system role outright. Audited.';

revoke all on function public.update_custom_role_permissions(uuid, text[]) from public, anon;
grant execute on function public.update_custom_role_permissions(uuid, text[]) to authenticated;

create or replace function public.delete_custom_role(target_role_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.roles;
  v_assignment_count int;
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator can delete a custom role';
  end if;

  select * into v_role from public.roles where id = target_role_id;
  if v_role.id is null then
    raise exception 'role % not found', target_role_id;
  end if;
  if v_role.is_system then
    raise exception 'system roles can never be deleted';
  end if;

  select count(*) into v_assignment_count from public.membership_roles where role_id = target_role_id;
  if v_assignment_count > 0 then
    raise exception 'this custom role is currently assigned to % membership(s) — remove those assignments first', v_assignment_count;
  end if;

  delete from public.role_permissions where role_id = target_role_id;
  delete from public.roles where id = target_role_id;

  insert into public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, changes)
  values (v_role.company_id, auth.uid(), 'delete', 'custom_role', target_role_id, jsonb_build_object('name', v_role.name));
end;
$$;

comment on function public.delete_custom_role(uuid) is
  'Platform Super Admin-only. Refuses to delete a system role (always) or a custom role still assigned to any membership (mirrors membership_roles_delete_managers'' own "cannot remove the last company_admin" caution — never silently orphan an assignment). Audited.';

revoke all on function public.delete_custom_role(uuid) from public, anon;
grant execute on function public.delete_custom_role(uuid) to authenticated;
