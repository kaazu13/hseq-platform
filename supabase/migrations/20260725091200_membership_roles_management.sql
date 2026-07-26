-- membership_roles: INSERT/DELETE policies — previously deferred entirely
-- (see 20260725090900_rls_policies.sql's "role assignment management is
-- not built in this milestone" note). Built now because the employee
-- Roles tab needs to assign/remove roles through these exact tables (per
-- this milestone's explicit instruction not to invent a second role
-- system). SELECT is unchanged — the existing
-- membership_roles_select_own_or_active_member policy already covers
-- reading roles for the tab.
--
-- Both policies enforce the same three rules, entirely in the database
-- (not just hidden in the UI):
--   1. Only company_admin or operations_manager may assign/remove roles.
--   2. platform_super_admin can never be assigned through this table by
--      anyone (there is no in-app flow for it at all — see
--      docs/DATABASE_SCHEMA.md's platform_super_admins section).
--   3. operations_manager additionally may never assign/remove a
--      company_admin role — only company_admin can grant or revoke
--      company_admin.
-- DELETE additionally guards against removing an organization's last
-- remaining company_admin role, regardless of who is doing the removing.

grant insert, delete on public.membership_roles to authenticated;

create policy membership_roles_insert_managers
  on public.membership_roles
  for insert
  to authenticated
  with check (
    public.is_organization_member(organization_id)
    and not exists (
      select 1 from public.roles r
      where r.id = membership_roles.role_id
        and r.name = 'platform_super_admin'
    )
    and (
      public.has_organization_role(organization_id, 'company_admin')
      or (
        public.has_organization_role(organization_id, 'operations_manager')
        and not exists (
          select 1 from public.roles r
          where r.id = membership_roles.role_id
            and r.name = 'company_admin'
        )
      )
    )
  );

create policy membership_roles_delete_managers
  on public.membership_roles
  for delete
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_organization_role(organization_id, 'company_admin')
      or (
        public.has_organization_role(organization_id, 'operations_manager')
        and not exists (
          select 1 from public.roles r
          where r.id = membership_roles.role_id
            and r.name = 'company_admin'
        )
      )
    )
    and (
      -- Preserve at least one company_admin: block the delete only when
      -- the role being removed IS company_admin AND it's the organization's
      -- only remaining one (counting active memberships only).
      not exists (
        select 1 from public.roles r
        where r.id = membership_roles.role_id
          and r.name = 'company_admin'
      )
      or (
        select count(*)
        from public.membership_roles mr2
        join public.roles r2 on r2.id = mr2.role_id
        join public.organization_memberships m2 on m2.id = mr2.membership_id
        where mr2.organization_id = membership_roles.organization_id
          and r2.name = 'company_admin'
          and m2.status = 'active'
      ) > 1
    )
  );

comment on policy membership_roles_insert_managers on public.membership_roles is
  'company_admin can assign any role except platform_super_admin; operations_manager can assign any role except company_admin/platform_super_admin.';
comment on policy membership_roles_delete_managers on public.membership_roles is
  'Same assigner rules as the insert policy, plus: a company_admin role assignment cannot be removed if it is the organization''s last one.';
