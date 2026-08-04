-- Defense-in-depth for the new employee-to-profile linking capability
-- (modules/employees/actions.ts's linkEmployeeToProfile — the first
-- application code to ever write employees.profile_id; see that column's
-- original comment in 20260725091000_employees.sql: "if this is ever set
-- by a future activation flow, that flow must validate..."). A partial
-- unique index (profile_id is not null) prevents two employee records in
-- the SAME organization ever linking to the same login account —
-- app-level validation in linkEmployeeToProfile() checks this too, but a
-- database constraint is the real backstop per docs/API_CONVENTIONS.md §6.
create unique index employees_organization_id_profile_id_key
  on public.employees (organization_id, profile_id)
  where profile_id is not null;
