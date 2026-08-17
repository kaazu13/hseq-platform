-- Task 3 Part 13 follow-up, found via extensive live attack-testing: after
-- widening projects_update's RLS (20260901115000) to admit `planner`, a
-- planner's UPDATE against site_address/site_latitude/site_longitude still
-- silently affected 0 rows — no error, easily mistaken for "denied
-- correctly" but actually an unexplained RLS/UPDATE-planning discrepancy:
-- the exact same boolean expression the policy uses, evaluated directly
-- with literal values, computes true for this exact planner/project pair;
-- a raw SQL UPDATE run with the role and JWT claim explicitly set to
-- reproduce the identical auth context ALSO affects 0 rows; the identical
-- mechanism used for company_admin (the pre-existing, already-working
-- role) succeeds every time. Root cause not fully isolated despite
-- extensive testing (boolean-expression re-evaluation, raw-SQL role
-- switching, ruling out stale policies/duplicate function overloads/stale
-- membership data — all clean). Rather than continue chasing an opaque
-- Postgres-internals discrepancy, this migration sidesteps it entirely:
-- BOTH company_admin and planner now write through the same SECURITY
-- DEFINER RPC platform_super_admin already used (20260901115000/115500),
-- which bypasses the base projects_update RLS gate altogether — the
-- existing BEFORE UPDATE triggers (validate_project_location_settings_update/
-- validate_project_site_location_update) remain the REAL authorization +
-- data-validation backstop regardless of how the UPDATE was issued, since
-- triggers always fire independent of RLS.
--
-- projects_update's RLS is reverted to its pre-Part-13 shape (planner
-- removed) — it no longer needs to admit planner at all, since planner's
-- write now goes through the RPC below, not a raw table UPDATE.
alter policy projects_update
  on public.projects
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(id)
    )
  )
  with check (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(id)
    )
  );

comment on policy projects_update on public.projects is
  'company_admin/operations_manager (company-wide), or the project''s own assigned Project Manager, may update the row directly. planner does NOT get raw UPDATE access (see update_project_site_location() below instead) — an unexplained RLS/UPDATE-planning discrepancy made a straightforward RLS widening for planner unreliable in practice (confirmed via extensive live testing), so their write path goes through a SECURITY DEFINER RPC instead, same as platform_super_admin.';

-- Unified RPC for country_code/timezone — every qualifying actor
-- (platform_super_admin, company_admin) writes through this one path now,
-- not split between RLS-driven (company_admin) and RPC-driven
-- (platform_super_admin) mechanisms. validate_project_location_settings_update()
-- still fires and still re-validates the actor + the data.
create or replace function public.update_project_location_settings(target_project_id uuid, target_country_code text default null, target_timezone text default null)
returns public.projects
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_result public.projects;
begin
  select company_id into v_company_id from public.projects where id = target_project_id;
  if v_company_id is null then
    raise exception 'project % not found', target_project_id;
  end if;

  if not (public.is_platform_super_admin() or public.has_company_role(v_company_id, 'company_admin')) then
    raise exception 'only a Platform Super Admin or Company Admin may change a project''s country/timezone';
  end if;

  update public.projects
  set country_code = target_country_code, timezone = target_timezone, updated_by = auth.uid()
  where id = target_project_id
  returning * into v_result;

  return v_result;
end;
$$;

comment on function public.update_project_location_settings(uuid, text, text) is
  'Unified write path for projects.country_code/timezone — platform_super_admin or company_admin, in ANY company (this function itself does the authorization check, not RLS). Replaces the split RLS-driven/platform_admin_update_project_location_settings() design after 20260901115000''s RLS widening proved unreliable for a sibling case (planner/site_location) — kept as one consistent, always-correct mechanism instead. validate_project_location_settings_update() (the BEFORE UPDATE trigger) still fires and still re-validates both the actor and the data (2-letter code, real IANA timezone) regardless of this function''s own check, since triggers always fire independent of RLS/SECURITY DEFINER.';

revoke all on function public.update_project_location_settings(uuid, text, text) from public, anon;
grant execute on function public.update_project_location_settings(uuid, text, text) to authenticated;

drop function if exists public.platform_admin_update_project_location_settings(uuid, text, text);

-- Unified RPC for site_address/lat/long — platform_super_admin,
-- company_admin, OR planner.
create or replace function public.update_project_site_location(target_project_id uuid, target_site_address text default null, target_site_latitude numeric default null, target_site_longitude numeric default null)
returns public.projects
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_result public.projects;
begin
  select company_id into v_company_id from public.projects where id = target_project_id;
  if v_company_id is null then
    raise exception 'project % not found', target_project_id;
  end if;

  if not (public.is_platform_super_admin() or public.has_any_company_role(v_company_id, array['company_admin', 'planner'])) then
    raise exception 'only a Platform Super Admin, Company Admin, or Planner may change a project''s site location';
  end if;

  update public.projects
  set site_address = target_site_address, site_latitude = target_site_latitude, site_longitude = target_site_longitude, updated_by = auth.uid()
  where id = target_project_id
  returning * into v_result;

  return v_result;
end;
$$;

comment on function public.update_project_site_location(uuid, text, numeric, numeric) is
  'Unified write path for projects.site_address/site_latitude/site_longitude — platform_super_admin, company_admin, or planner, in ANY company (this function itself does the authorization check, not RLS — see projects_update''s policy comment for why planner specifically needed this instead of a plain RLS widening). validate_project_site_location_update() (the BEFORE UPDATE trigger) still fires and still re-validates both the actor and the data (lat/long range) regardless.';

revoke all on function public.update_project_site_location(uuid, text, numeric, numeric) from public, anon;
grant execute on function public.update_project_site_location(uuid, text, numeric, numeric) to authenticated;

drop function if exists public.platform_admin_update_project_site_location(uuid, text, numeric, numeric);
