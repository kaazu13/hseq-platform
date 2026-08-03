-- Bug fix found during Toolbox Meetings manual verification, but the bug
-- is pre-existing and cross-cutting — not specific to this milestone.
--
-- assert_employee_eligible_for_assignment(target_employee_id) is SECURITY
-- INVOKER, so its `select employment_status, archived_at from employees
-- where id = target_employee_id` runs under the CALLER's own employees_select
-- RLS visibility (employees_select_managers_or_own_record,
-- 20260725091100_role_helper_and_employees_rls.sql), which deliberately
-- excludes hse_officer and foreman from organization-wide employee
-- visibility (see that migration's own comment: "HSE Officer, Foreman,
-- and Recruiter deliberately have no organization-wide employee-directory
-- access"). So whenever an hse_officer (or foreman) references a
-- DIFFERENT employee by id — e.g. an hse_officer naming another HSE
-- person as a Toolbox Meeting's held_by_employee_id/Safety Flash's
-- issued_by_employee_id, or (the same latent bug, not yet hit in
-- practice) an hse_officer registering a scaffold and naming a foreman as
-- responsible_foreman_id — the select returns no row purely because the
-- CALLER can't see that employee in a directory listing, and the
-- function incorrectly raises "employee % not found" even though the
-- employee is perfectly valid and eligible.
--
-- "Can I see this person in a general directory" and "can I legitimately
-- NAME this person as an already-authorized third party on a record I'm
-- creating" are different questions — this function only ever needs to
-- answer the second one. Fixed by making it SECURITY DEFINER, the same
-- fix already applied for exactly this class of problem in
-- employee_has_any_organization_role() (this milestone) and
-- get_basic_employee_info()/get_toolbox_authorized_employee_info()
-- (existing precedent) — it grants no new INSERT/UPDATE capability, only
-- lets this existence/status check bypass the caller's own SELECT
-- visibility restriction.
create or replace function public.assert_employee_eligible_for_assignment(target_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employment_status public.employment_status;
  v_archived_at timestamptz;
begin
  select employment_status, archived_at into v_employment_status, v_archived_at
  from public.employees
  where id = target_employee_id;

  if v_employment_status is null then
    raise exception 'employee % not found', target_employee_id;
  end if;

  if v_archived_at is not null then
    raise exception 'employee % is archived and cannot be assigned', target_employee_id;
  end if;

  if v_employment_status <> 'active' then
    raise exception 'employee % is not currently employed (employment_status = %) and cannot be assigned', target_employee_id, v_employment_status;
  end if;
end;
$$;
