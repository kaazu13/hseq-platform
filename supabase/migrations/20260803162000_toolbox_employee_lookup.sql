-- Small, additive follow-up to 20260803160000: the "HSE person who held
-- the meeting" / "issued by" fields need to render as a clickable link to
-- that person's existing employee profile page
-- (app/(app)/employees/[employeeNumber]/page.tsx, keyed by
-- employees.employee_number). The existing shared get_basic_employee_info()
-- (20260728090000_projects_and_teams.sql) does not return employee_number
-- — it's used by four other modules already, so it is deliberately NOT
-- modified here (an unrelated, broader change); this is a small, scoped
-- lookup specific to this milestone instead.
--
-- Visibility: anyone who is an active member of the employee's
-- organization. This is deliberately simpler than get_basic_employee_info()'s
-- role-gated visibility — a toolbox meeting/safety flash's held-by/
-- issued-by person's name and employee number is already effectively
-- public within the org the moment the record itself is visible (every
-- role that can see ANY toolbox_meetings/safety_flashes row can already
-- see this person's name in that row's own display), so gating this
-- lookup more tightly would add no real protection, only broken links.
create or replace function public.get_toolbox_authorized_employee_info(target_employee_ids uuid[])
returns table (
  id uuid,
  first_name text,
  last_name text,
  employee_number text,
  profile_id uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id, e.first_name, e.last_name, e.employee_number, e.profile_id
  from public.employees e
  where e.id = any(target_employee_ids)
    and public.is_organization_member(e.organization_id);
$$;

comment on function public.get_toolbox_authorized_employee_info(uuid[]) is
  'Resolves display name + employee_number (for the clickable profile link) for toolbox meeting/safety flash held-by/issued-by employees. See migration header for why this is separate from get_basic_employee_info().';

revoke all on function public.get_toolbox_authorized_employee_info(uuid[]) from public;
grant execute on function public.get_toolbox_authorized_employee_info(uuid[]) to authenticated;
