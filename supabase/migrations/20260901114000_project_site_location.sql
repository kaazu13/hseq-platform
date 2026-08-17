-- Task 3 Part 13: project physical site location (address + GPS), for
-- Part 14's "Directions" UI. A separate edit-permission matrix from Part
-- 12's country/timezone: platform_super_admin + company_admin + planner —
-- planner is the role that actually plans site logistics, so it makes
-- sense for them to set this even though they can't touch country/timezone
-- (which drives date/time business logic, a different, higher-stakes
-- concern). Same "RLS can't express per-column authorization, so a BEFORE
-- UPDATE trigger does" pattern as 20260901113000.
alter table public.projects
  add column site_address text,
  add column site_latitude numeric(9, 6),
  add column site_longitude numeric(9, 6),
  add constraint projects_site_latitude_range check (site_latitude is null or (site_latitude >= -90 and site_latitude <= 90)),
  add constraint projects_site_longitude_range check (site_longitude is null or (site_longitude >= -180 and site_longitude <= 180));

comment on column public.projects.site_address is
  'Free-text physical site address (for display + the Directions link — Part 14) — optional. Edit-permission: platform_super_admin + company_admin + planner (validate_project_site_location_update).';
comment on column public.projects.site_latitude is 'Decimal degrees, optional — paired with site_longitude for the Directions link.';
comment on column public.projects.site_longitude is 'Decimal degrees, optional — paired with site_latitude for the Directions link.';

create or replace function public.validate_project_site_location_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.site_address is distinct from old.site_address
    or new.site_latitude is distinct from old.site_latitude
    or new.site_longitude is distinct from old.site_longitude
  then
    if not (public.is_platform_super_admin() or public.has_any_company_role(new.company_id, array['company_admin', 'planner'])) then
      raise exception 'only a Platform Super Admin, Company Admin, or Planner may change a project''s site location';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.validate_project_site_location_update() is
  'Field-level authorization for site_address/site_latitude/site_longitude — platform_super_admin + company_admin + planner only, even though projects_update''s RLS also lets operations_manager/the assigned Project Manager update the row''s other fields (same pattern as validate_project_location_settings_update, different role set).';

create trigger projects_validate_site_location_update
  before update on public.projects
  for each row execute function public.validate_project_site_location_update();
