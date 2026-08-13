-- Real, pre-existing bug found live while seeding test data for the
-- adjacent copy-teams/notifications migration: create_initial_employment_period()
-- (20260727090000_employment_periods.sql) still referenced
-- NEW.organization_id and inserted into employee_employment_periods
-- (organization_id, ...). The organizations -> companies rename
-- (20260806090000_rename_organizations_to_companies.sql) renamed the
-- underlying TABLE COLUMN, but a plain column rename does not rewrite
-- existing function BODIES, and this one specific trigger function was
-- missed by that migration's otherwise-thorough sweep. Result: EVERY new
-- employee insert has been failing outright ("column organization_id does
-- not exist") since that rename shipped — confirmed live. Fixed here as
-- its own small, isolated migration (never editing an already-applied
-- one).
create or replace function public.create_initial_employment_period()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  insert into public.employee_employment_periods (company_id, employee_id, start_date, created_by)
  values (new.company_id, new.id, coalesce(new.start_date, current_date), new.created_by);
  return new;
end;
$$;
