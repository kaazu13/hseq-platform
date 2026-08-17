-- Follow-up to 20260901115000: the two new platform_admin_update_project_*
-- RPCs' text/numeric parameters generated as non-nullable TypeScript types
-- (Supabase's type generator treats a parameter with no DEFAULT as
-- required/non-null) even though every one of them is meant to accept null
-- (clearing a field). Adding `default null` to each fixes the generated
-- types without changing behavior — every existing call already passes an
-- explicit value or explicit null.
create or replace function public.platform_admin_update_project_location_settings(target_project_id uuid, target_country_code text default null, target_timezone text default null)
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

revoke all on function public.platform_admin_update_project_location_settings(uuid, text, text) from public, anon;
grant execute on function public.platform_admin_update_project_location_settings(uuid, text, text) to authenticated;

create or replace function public.platform_admin_update_project_site_location(target_project_id uuid, target_site_address text default null, target_site_latitude numeric default null, target_site_longitude numeric default null)
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

revoke all on function public.platform_admin_update_project_site_location(uuid, text, numeric, numeric) from public, anon;
grant execute on function public.platform_admin_update_project_site_location(uuid, text, numeric, numeric) to authenticated;
