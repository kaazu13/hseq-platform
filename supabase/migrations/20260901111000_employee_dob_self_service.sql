-- Task 3 Part 7: employees.birth_date already existed (set by an admin via
-- employee-form.tsx, shown on the admin employee-overview tab), but no
-- employee could ever view or edit their OWN birth date — employees_
-- update_managers (20260725091100_role_helper_and_employees_rls.sql) is
-- management-tier only, with no row-ownership branch at all. This gives a
-- narrow, self-only path: a signed-in employee may set/clear ONLY their own
-- birth_date, nothing else on the row.
--
-- Sanity bound (14-100 years old) applied as a real CHECK constraint so it
-- covers BOTH this self-service RPC and the existing admin employee-form
-- path uniformly, not duplicated app-side logic that could drift. No
-- existing row currently violates this (checked live before writing this
-- migration).
alter table public.employees
  add constraint employees_birth_date_sane check (
    birth_date is null
    or (birth_date <= current_date - interval '14 years' and birth_date >= current_date - interval '100 years')
  );

comment on constraint employees_birth_date_sane on public.employees is
  'birth_date, when set, must put the person between 14 and 100 years old — a basic sanity bound, not a legal minimum-working-age determination (that varies by jurisdiction and is out of scope here).';

create or replace function public.update_my_birth_date(target_company_id uuid, target_birth_date date)
returns public.employees
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result public.employees;
begin
  update public.employees
  set birth_date = target_birth_date, updated_by = auth.uid()
  where company_id = target_company_id and profile_id = auth.uid()
  returning * into v_result;

  if v_result.id is null then
    raise exception 'no linked employee record found for you in this company';
  end if;

  return v_result;
end;
$$;

comment on function public.update_my_birth_date(uuid, date) is
  'The ONLY self-service write path for employees.birth_date. SECURITY DEFINER because employees_update_managers (RLS) has no row-ownership branch at all — this function supplies its own, narrower "profile_id = auth.uid()" check instead, and only ever touches birth_date/updated_by, nothing else on the row. Own-view/edit only (Task 3 Part 7) — never broadens visibility to anyone else.';

revoke all on function public.update_my_birth_date(uuid, date) from public, anon;
grant execute on function public.update_my_birth_date(uuid, date) to authenticated;
