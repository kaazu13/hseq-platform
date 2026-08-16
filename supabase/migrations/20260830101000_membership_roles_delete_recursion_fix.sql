-- Operational audit finding (discovered incidentally during test-fixture
-- cleanup, then confirmed as a genuine, pre-existing bug): every DELETE
-- attempt on membership_roles via the normal authenticated PostgREST path
-- fails with "42P17 infinite recursion detected in policy for relation
-- membership_roles". Root cause: membership_roles_delete_managers' "preserve
-- at least one company_admin" guard queries membership_roles AGAIN, as a
-- plain correlated subquery, from within membership_roles' own DELETE
-- policy — `select count(*) from membership_roles mr2 join roles r2 ...
-- join company_memberships m2 ... where mr2.company_id = ...`. Because this
-- inner query touches the very table the policy is defined on, Postgres
-- re-evaluates membership_roles' RLS policies (including this one) to plan
-- the subquery, which references membership_roles again, and so on —
-- unlike every other cross-table/cross-row check in this schema (is_company_
-- member(), has_company_role(), is_project_manager(), etc.), which are all
-- SECURITY DEFINER functions specifically so a query against another
-- RLS-protected table from inside a policy never re-triggers that table's
-- own RLS. This one check was written as an inline subquery instead,
-- missing that established, otherwise-universal precedent — a real,
-- practical impact: no company_admin/operations_manager can ever remove a
-- role from ANY membership (e.g. correcting a mis-assigned role, demoting
-- someone) through the normal app path; the delete just 500s.
--
-- Fix: move the last-active-company_admin count into its own SECURITY
-- DEFINER helper (mirroring the exact shape/reasoning of every other
-- helper in this file family) so the subquery no longer re-enters RLS,
-- then point the policy at it. No behavior change — same count, same
-- comparison, same guard — purely a recursion fix.
create or replace function public.count_active_company_admin_memberships(target_company_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer
  from public.membership_roles mr2
  join public.roles r2 on r2.id = mr2.role_id
  join public.company_memberships m2 on m2.id = mr2.membership_id
  where mr2.company_id = target_company_id
    and r2.name = 'company_admin'
    and m2.status = 'active';
$$;

comment on function public.count_active_company_admin_memberships(uuid) is
  'How many ACTIVE company_admin-role memberships target_company_id currently has. SECURITY DEFINER so membership_roles_delete_managers'' "preserve at least one company_admin" guard can call it without re-entering membership_roles'' own RLS (the prior inline subquery form caused 42P17 infinite recursion on every delete) — see 20260830101000_membership_roles_delete_recursion_fix.sql.';

revoke all on function public.count_active_company_admin_memberships(uuid) from public, anon;
grant execute on function public.count_active_company_admin_memberships(uuid) to authenticated;

alter policy membership_roles_delete_managers
  on public.membership_roles
  using (
    public.is_company_member(company_id)
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
    and (
      not exists (
        select 1 from public.roles r
        where r.id = membership_roles.role_id
          and r.name = 'company_admin'
      )
      or public.count_active_company_admin_memberships(membership_roles.company_id) > 1
    )
  );
