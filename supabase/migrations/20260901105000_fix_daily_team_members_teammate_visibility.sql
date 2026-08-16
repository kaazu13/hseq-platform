-- CRITICAL fix, caught by live testing during the second Employee-role
-- correction pass. daily_team_members_select's plain-employee branch was
-- `exists (select 1 from employees e where e.id = daily_team_members.
-- employee_id and e.profile_id = auth.uid())` — this only ever matches a
-- caller's OWN membership row, never a teammate's. Every "Your team:
-- [coworker names]" feature that reads daily_team_members for colleagues
-- (modules/daily-workforce/queries.ts's getEmployeeTodayCard — used by
-- both the Employee Dashboard section AND this milestone's new personal
-- Today's Team card) has therefore ALWAYS silently shown an empty
-- coworker list for a plain employee, even when real teammates exist —
-- confirmed live: a fixture team with two 'member' rows (the test
-- employee + one other) only ever returned the caller's own row when
-- queried as that employee.
--
-- Fix: an employee who is THEMSELVES a current (non-removed) member of a
-- given daily_team_id may see every OTHER current member row on that same
-- team — never any other team's roster. Written as a SECURITY DEFINER
-- helper (this schema's own established pattern — see
-- 20260901099000_fix_lmra_select_infinite_recursion.sql's header for why
-- a plain inline self-referencing sub-select inside a policy is avoided
-- here even though, unlike that bug, this one wouldn't actually recurse
-- forever — the caller's OWN row already resolves via the policy's
-- existing "e.profile_id = auth.uid()" branch without needing this new
-- branch to fire for it).
create or replace function public.employee_is_on_daily_team(target_daily_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.daily_team_members dtm
    join public.employees e on e.id = dtm.employee_id
    where dtm.daily_team_id = target_daily_team_id
      and dtm.removed_at is null
      and e.profile_id = auth.uid()
  );
$$;

comment on function public.employee_is_on_daily_team(uuid) is
  'SECURITY DEFINER so daily_team_members_select can let a caller see their OWN team''s other current members without re-triggering RLS recursion or requiring a broad company-role grant — never a bypass for any other team''s roster.';

revoke all on function public.employee_is_on_daily_team(uuid) from public, anon;
grant execute on function public.employee_is_on_daily_team(uuid) to authenticated;

drop policy if exists daily_team_members_select on public.daily_team_members;
create policy daily_team_members_select
  on public.daily_team_members
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or (public.has_project_access(project_id) and public.has_any_company_role(company_id, array['project_manager', 'hseq_manager', 'hse_officer', 'inspector', 'foreman']))
      or exists (select 1 from public.employees e where e.id = daily_team_members.employee_id and e.profile_id = auth.uid())
      or public.employee_is_on_daily_team(daily_team_members.daily_team_id)
    )
  );

comment on policy daily_team_members_select on public.daily_team_members is
  'Company-wide managers, or PM/HSE Manager/HSE Officer/Inspector/Foreman with project access, see everything. A plain employee sees their OWN row (unchanged) PLUS every other current member row on a team they themselves currently belong to (new — fixes the "Your team" coworker list silently being empty for every plain employee). Still never another team''s roster.';
