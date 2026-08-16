-- ============================================================================
-- Completion pass, Part 6 (custom-role foundation hardening): a real gap
-- found while verifying "custom-role assignment cannot bypass company
-- scope" — membership_roles_insert_managers (originally
-- 20260725091200_membership_roles_management.sql, last body change
-- 20260726120000_role_catalogue_update.sql) checks the ASSIGNING caller's
-- own role and rejects platform_super_admin as a target role, but never
-- checks that the TARGET role itself actually belongs to the same company
-- as the membership row being granted it.
--
-- System roles (roles.company_id is null) are fine to assign in any
-- company by design — that's the whole point of a system role. But a
-- CUSTOM role (roles.company_id is NOT null, added this milestone by
-- 20260831092000_roles_permissions_foundation.sql) is supposed to be
-- scoped to exactly one company. Without this check, a company_admin of
-- Company B could attach Company A's custom role to one of Company B's
-- own memberships via a direct insert (RLS admits it; nothing in the
-- application UI currently offers this, but RLS — not the UI — is this
-- codebase's real enforcement layer throughout). Custom roles grant
-- nothing operationally today (see roles page's own notice), so this is
-- not yet an active escalation, but it is exactly the kind of dormant
-- cross-company data-integrity gap that becomes a real one the moment
-- custom-role enforcement is wired into any operational module — fixed
-- now, at the same layer as everything else here.
-- ============================================================================
alter policy membership_roles_insert_managers
  on public.membership_roles
  with check (
    public.is_company_member(company_id)
    and exists (
      select 1 from public.roles r
      where r.id = membership_roles.role_id
        and r.name <> 'platform_super_admin'
        and (r.company_id is null or r.company_id = membership_roles.company_id)
    )
    and (
      public.has_company_role(company_id, 'company_admin')
      or (
        public.has_company_role(company_id, 'operations_manager')
        and not exists (
          select 1 from public.roles r
          where r.id = membership_roles.role_id
            and r.name in ('company_admin', 'project_manager', 'hseq_manager', 'hse_officer', 'foreman', 'recruiter')
        )
      )
    )
  );

comment on policy membership_roles_insert_managers on public.membership_roles is
  'company_admin/operations_manager may assign roles to memberships in their own company (WC excluded from elevated/specialist roles, see 20260726120000''s comment). Never platform_super_admin. NEW (this migration): the target role must be a system role (company_id is null) or a custom role belonging to THIS SAME company — closes a cross-company custom-role assignment gap that predates custom roles existing at all.';
