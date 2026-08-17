-- Task 3 Parts 12/13 follow-up fix, found via live attack-testing (not
-- assumed): projects_update's base RLS USING/WITH CHECK only ever admitted
-- company_admin/operations_manager/the assigned project_manager — planner
-- and platform_super_admin were never in it. 20260901113000/20260901114000's
-- new triggers correctly RESTRICT which of the already-admitted actors may
-- touch country_code/timezone/site_*, but they can't GRANT row-level access
-- to someone RLS blocks before the trigger ever runs — a planner's UPDATE
-- attempt against site_address silently affected 0 rows (no error, easily
-- mistaken for success), and platform_super_admin (who, by design, usually
-- has NO company_memberships row at all — confirmed live: is_company_member
-- returns false for the platform_super_admin fixture in the test company)
-- was blocked identically.
--
-- Fix, split by actor per this codebase's established convention:
--
-- 1) planner IS a normal company member — just missing from the allowed-
--    roles array. A safe, ordinary RLS widening: the new triggers already
--    restrict planner to ONLY site_address/site_latitude/site_longitude,
--    so admitting them to the base UPDATE grants nothing beyond that.
alter policy projects_update
  on public.projects
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager', 'planner'])
      or public.is_project_manager(id)
    )
  )
  with check (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager', 'planner'])
      or public.is_project_manager(id)
    )
  );

comment on policy projects_update on public.projects is
  'company_admin/operations_manager/planner (company-wide), or the project''s own assigned Project Manager, may update the row — but validate_project_location_settings_update()/validate_project_site_location_update() further restrict which SPECIFIC columns each of those may actually change (e.g. planner may reach country_code/timezone at the RLS level but the trigger still rejects the change). platform_super_admin is deliberately NOT added here — per this codebase''s established convention (20260901090000_platform_admin_console.sql''s header comment), a platform super admin''s write access to a tenant table goes through a dedicated, narrowly-scoped SECURITY DEFINER RPC, never a widened tenant RLS policy.';

-- 2) platform_super_admin — dedicated RPCs, matching the exact
--    suspend_account()/ban_account() convention (is_platform_super_admin()
--    gate, SECURITY DEFINER, bypasses RLS entirely). The already-existing
--    BEFORE UPDATE triggers still fire and still validate the data
--    (2-letter code, real IANA timezone, lat/long range) regardless of how
--    the UPDATE was issued — nothing about that validation needs
--    duplicating here.
create or replace function public.platform_admin_update_project_location_settings(target_project_id uuid, target_country_code text, target_timezone text)
returns public.projects
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result public.projects;
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator may use this';
  end if;

  update public.projects
  set country_code = target_country_code, timezone = target_timezone, updated_by = auth.uid()
  where id = target_project_id
  returning * into v_result;

  if v_result.id is null then
    raise exception 'project % not found', target_project_id;
  end if;

  return v_result;
end;
$$;

comment on function public.platform_admin_update_project_location_settings(uuid, text, text) is
  'platform_super_admin-only path to set a project''s country_code/timezone across ANY company (never company-scoped like the RLS-driven path company_admin/planner use). Mirrors suspend_account()''s is_platform_super_admin()-gated SECURITY DEFINER shape exactly.';

revoke all on function public.platform_admin_update_project_location_settings(uuid, text, text) from public, anon;
grant execute on function public.platform_admin_update_project_location_settings(uuid, text, text) to authenticated;

create or replace function public.platform_admin_update_project_site_location(target_project_id uuid, target_site_address text, target_site_latitude numeric, target_site_longitude numeric)
returns public.projects
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result public.projects;
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator may use this';
  end if;

  update public.projects
  set site_address = target_site_address, site_latitude = target_site_latitude, site_longitude = target_site_longitude, updated_by = auth.uid()
  where id = target_project_id
  returning * into v_result;

  if v_result.id is null then
    raise exception 'project % not found', target_project_id;
  end if;

  return v_result;
end;
$$;

comment on function public.platform_admin_update_project_site_location(uuid, text, numeric, numeric) is
  'platform_super_admin-only path to set a project''s site_address/site_latitude/site_longitude across ANY company. Mirrors suspend_account()''s is_platform_super_admin()-gated SECURITY DEFINER shape exactly.';

revoke all on function public.platform_admin_update_project_site_location(uuid, text, numeric, numeric) from public, anon;
grant execute on function public.platform_admin_update_project_site_location(uuid, text, numeric, numeric) to authenticated;
