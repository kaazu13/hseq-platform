-- New RLS helper function (`has_any_organization_role`) + RLS for
-- `employees`. Kept as a new migration rather than editing
-- 20260725090800_rls_helper_functions.sql / ...090900_rls_policies.sql —
-- migrations already "applied" (conceptually — see the implementation
-- report on why nothing has actually been pushed remotely yet) are not
-- edited after the fact; new behavior is a new file.

-- ── has_any_organization_role ────────────────────────────────────────────
-- Same shape, same SECURITY DEFINER/STABLE/search_path rationale as
-- is_organization_member()/has_organization_role() in
-- 20260725090800_rls_helper_functions.sql — see that file's header comment
-- for why. This is NOT a second role system: it is a thin convenience
-- wrapper over the same organization_memberships/membership_roles/roles
-- tables, added because "does the caller hold ANY of these N roles" is a
-- check every module from here on needs (employees' read-access roles
-- alone are eight of the ten roles), and repeating an 8-way OR of
-- has_organization_role() calls in every policy would be unreadable.
create or replace function public.has_any_organization_role(target_org_id uuid, role_names text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r on r.id = mr.role_id
    where m.organization_id = target_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and r.name = any(role_names)
  );
$$;

comment on function public.has_any_organization_role(uuid, text[]) is
  'True if the calling user has an ACTIVE membership in the given organization AND holds at least one of the named roles there. Convenience wrapper over has_organization_role() for "any of N roles" checks.';

revoke execute on function public.has_any_organization_role(uuid, text[]) from public;
grant execute on function public.has_any_organization_role(uuid, text[]) to authenticated;

-- ── employees ─────────────────────────────────────────────────────────
alter table public.employees enable row level security;
alter table public.employees force row level security;

-- No DELETE grant at all — employees are never permanently deleted through
-- the application (see docs/DATABASE_SCHEMA.md's Deletion Behavior
-- Summary); "archiving" is an UPDATE (account_status/archived_at), not a
-- DELETE. This makes hard deletion structurally impossible before RLS is
-- even considered, the same pattern used for audit_events.
grant select, insert, update on public.employees to authenticated;

-- Read access: everyone with an organization-wide operational role sees
-- every employee in the org; a user with only the plain `employee` role
-- sees only the row(s) linked to their own profile. Both conditions are
-- OR'd — a manager who also happens to have a linked employee record
-- still sees everyone (the broader grant), not just themselves.
create policy employees_select_managers_or_own_record
  on public.employees
  for select
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(
        organization_id,
        array[
          'company_admin', 'operations_manager', 'hseq_manager', 'project_manager',
          'supervisor', 'inspector', 'planner', 'payroll_admin'
        ]
      )
      or profile_id = auth.uid()
    )
  );

-- Matches this milestone's explicit role split exactly:
--   - company_admin, operations_manager: full read/write (create/edit/archive) below.
--   - hseq_manager, project_manager, supervisor, inspector, planner,
--     payroll_admin: read-only (covered by this SELECT policy; no
--     INSERT/UPDATE grant for these roles specifically — the INSERT/UPDATE
--     policies below only pass for company_admin/operations_manager).
--   - employee (plain role, no elevated role): `profile_id = auth.uid()`
--     only — never the org-wide branch.
create policy employees_insert_managers
  on public.employees
  for insert
  to authenticated
  with check (
    public.is_organization_member(organization_id)
    and public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager'])
  );

create policy employees_update_managers
  on public.employees
  for update
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager'])
  )
  with check (
    public.is_organization_member(organization_id)
    and public.has_any_organization_role(organization_id, array['company_admin', 'operations_manager'])
  );

-- No DELETE policy — see the GRANT comment above; belt-and-suspenders the
-- same way audit_events is (no grant AND no policy would allow it).
