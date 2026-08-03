-- Small, additive follow-up to 20260803160000/20260803162000: the
-- "held by"/"issued by" picker on the Toolbox Meeting/Safety Flash create
-- forms needs a candidate LIST of employees eligible to be selected (not
-- just a lookup by known id, which get_toolbox_authorized_employee_info()
-- already covers) — every currently-active hseq_manager (org-wide) plus
-- every currently-active hse_officer with access to target_project_id
-- (or every hse_officer org-wide when target_project_id is null, for
-- Safety Flash's optional-project case).
create or replace function public.list_toolbox_authorized_employees(target_organization_id uuid, target_project_id uuid)
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
  select distinct e.id, e.first_name, e.last_name, e.employee_number, e.profile_id
  from public.employees e
  join public.organization_memberships m on m.user_id = e.profile_id and m.organization_id = target_organization_id and m.status = 'active'
  join public.membership_roles mr on mr.membership_id = m.id
  join public.roles r on r.id = mr.role_id
  where e.organization_id = target_organization_id
    and e.archived_at is null
    and e.employment_status = 'active'
    and (
      r.name = 'hseq_manager'
      or (
        r.name = 'hse_officer'
        and (
          target_project_id is null
          or exists (
            select 1 from public.project_assignments pa
            where pa.employee_id = e.id and pa.project_id = target_project_id and pa.end_at is null
          )
        )
      )
    )
  order by e.last_name, e.first_name;
$$;

comment on function public.list_toolbox_authorized_employees(uuid, uuid) is
  'Candidate pool for the "HSE person who held/issued it" picker — active hseq_manager (org-wide) or hse_officer (assigned to target_project_id, or any hse_officer at all when target_project_id is null — Safety Flash''s optional-project case).';

revoke all on function public.list_toolbox_authorized_employees(uuid, uuid) from public;
grant execute on function public.list_toolbox_authorized_employees(uuid, uuid) to authenticated;
