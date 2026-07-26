-- Role Catalogue & Permissions milestone — finalizes the organization role
-- model. See docs/ROLES_AND_PERMISSIONS.md and the implementation report
-- for this milestone for the full rationale; this migration is the
-- database half.
--
-- Changes, in the safe order the earlier retirement-strategy planning
-- settled on (add new roles first, migrate data second, delete obsolete
-- rows last — never delete before every reference is provably gone):
--   1. Add roles.display_label (key vs. label finally diverge for several
--      roles — company_admin/"Company Manager",
--      operations_manager/"Workforce Coordinator", hseq_manager/"HSE
--      Manager" — so a stored label is now a real, permanent product
--      need, not a one-off; `name` stays the stable machine key everyone
--      already depends on, unchanged).
--   2. Add the three new roles: foreman, hse_officer, recruiter.
--   3. Migrate any existing `supervisor` assignments to `foreman` (the
--      agreed replacement), then remove any existing `payroll_admin`
--      assignments (no replacement — payroll is out of scope for this
--      product).
--   4. Delete the now-unreferenced `supervisor`/`payroll_admin` rows.
--      `membership_roles.role_id` is `ON DELETE RESTRICT`
--      (20260725090500_membership_roles.sql) — if step 3 somehow missed a
--      reference, this fails loudly with a foreign-key violation instead
--      of silently corrupting a live grant. That existing constraint is
--      relied on here as the final safety net, not bypassed.
--   5. Update the two already-applied RLS policies that hard-code role
--      names (`employees_select_managers_or_own_record`,
--      `membership_roles_insert_managers`/`_delete_managers`) via ALTER
--      POLICY — not edited in place, this is a new migration altering
--      policies created by earlier ones, which is the normal way to
--      change a policy without touching an already-applied file.

-- ── 1) roles.display_label ────────────────────────────────────────────
alter table public.roles
  add column display_label text;

comment on column public.roles.display_label is
  'Human-facing label — independent of the stable `name` key so a role can be relabeled (e.g. operations_manager -> "Workforce Coordinator") without touching every place `name` is used as a permission check. `name` remains authoritative for all authorization logic; `display_label` is presentation-only.';

update public.roles set display_label = case name
  when 'platform_super_admin' then 'Platform Super Admin'
  when 'company_admin' then 'Company Manager'
  when 'operations_manager' then 'Workforce Coordinator'
  when 'project_manager' then 'Project Manager'
  when 'hseq_manager' then 'HSE Manager'
  when 'inspector' then 'Inspector'
  when 'planner' then 'Planner'
  when 'payroll_admin' then 'Payroll / Administration' -- retired in step 4; labeled anyway so no row is ever left NULL mid-migration
  when 'supervisor' then 'Supervisor' -- retired in step 4
  when 'employee' then 'Employee'
  else initcap(replace(name, '_', ' '))
end
where display_label is null;

-- ── 2) new roles ──────────────────────────────────────────────────────
insert into public.roles (name, description, display_label, is_system) values
  ('foreman', 'Assigned-project/team frontline operational leadership. Manages the specific teams they are assigned to within a project; cannot issue final company-level disciplinary actions independently.', 'Foreman', true),
  ('hse_officer', 'Assigned-project operational HSEQ role, kept separate from Inspector. Only sees assigned projects unless explicitly granted broader HSE scope.', 'HSE Officer', true),
  ('recruiter', 'Future Talent Pool and recruitment access. May see open-to-work employees and qualification validity once built. Cannot manage organization roles and does not see private disciplinary details or full audit history.', 'Recruiter', true)
on conflict (name) do update set
  description = excluded.description,
  display_label = excluded.display_label,
  is_system = excluded.is_system;

alter table public.roles
  alter column display_label set not null;

-- ── 3) migrate existing assignments off the retiring roles ───────────
-- supervisor -> foreman: for every membership currently holding
-- `supervisor`, ensure it also holds `foreman` (the agreed replacement),
-- preserving the original assignment's created_by as provenance — this
-- is a continuation of that same grant under its new name, not a fresh
-- assignment made by nobody. `on conflict do nothing` covers the edge
-- case where a membership already somehow holds both.
insert into public.membership_roles (organization_id, membership_id, role_id, created_by)
select mr.organization_id, mr.membership_id, foreman.id, mr.created_by
from public.membership_roles mr
join public.roles supervisor on supervisor.id = mr.role_id and supervisor.name = 'supervisor'
join public.roles foreman on foreman.name = 'foreman'
on conflict (membership_id, role_id) do nothing;

-- Remove the now-superseded supervisor rows.
delete from public.membership_roles mr
using public.roles r
where mr.role_id = r.id
  and r.name = 'supervisor';

-- payroll_admin has no replacement (payroll is out of scope for this
-- product) — any existing assignment is simply removed.
delete from public.membership_roles mr
using public.roles r
where mr.role_id = r.id
  and r.name = 'payroll_admin';

-- ── 4) delete the retired role rows ───────────────────────────────────
delete from public.roles where name in ('supervisor', 'payroll_admin');

-- ── 5) update role-name-dependent RLS policies ────────────────────────
-- employees_select_managers_or_own_record
-- (20260725091100_role_helper_and_employees_rls.sql): drops supervisor
-- and payroll_admin. Deliberately does NOT add foreman/hse_officer/
-- recruiter to this organization-wide employee-read grant — all three
-- are meant to be project-scoped once the Projects module exists;
-- granting them org-wide employee visibility now would be a permission
-- this milestone would have to walk back later, not a safe default.
alter policy employees_select_managers_or_own_record
  on public.employees
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_any_organization_role(
        organization_id,
        array['company_admin', 'operations_manager', 'hseq_manager', 'project_manager', 'inspector', 'planner']
      )
      or profile_id = auth.uid()
    )
  );

-- membership_roles_insert_managers / _delete_managers
-- (20260725091200_membership_roles_management.sql): expands the
-- operations_manager (Workforce Coordinator) assigner exclusion from
-- just `company_admin` to also cover project_manager, hseq_manager,
-- hse_officer, foreman, and recruiter — Workforce Coordinator may still
-- assign/remove operations_manager (itself), inspector, planner, and
-- employee, but must never promote anyone into an elevated or
-- specialist-management role. Mirrors the exact restriction agreed
-- during this milestone's planning. company_admin's own assigner
-- condition, and the "preserve at least one company_admin" delete guard,
-- are untouched.
alter policy membership_roles_insert_managers
  on public.membership_roles
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
            and r.name in ('company_admin', 'project_manager', 'hseq_manager', 'hse_officer', 'foreman', 'recruiter')
        )
      )
    )
  );

alter policy membership_roles_delete_managers
  on public.membership_roles
  using (
    public.is_organization_member(organization_id)
    and (
      public.has_organization_role(organization_id, 'company_admin')
      or (
        public.has_organization_role(organization_id, 'operations_manager')
        and not exists (
          select 1 from public.roles r
          where r.id = membership_roles.role_id
            and r.name in ('company_admin', 'project_manager', 'hseq_manager', 'hse_officer', 'foreman', 'recruiter')
        )
      )
    )
    and (
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
