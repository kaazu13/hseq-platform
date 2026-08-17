-- Task 3 Part 12: project country_code + timezone. These drive Part 11's
-- project-local header clock and Part 15's project-local "today" audit
-- (LMRA default date, Today's Teams, Attendance, etc.) — both optional
-- fields, since not every existing project will have one set immediately.
--
-- Edit-permission matrix: platform_super_admin + company_admin ONLY — a
-- genuinely NARROWER gate than projects_update's existing RLS (which also
-- lets operations_manager and the project's own assigned Project Manager
-- edit every other core field). RLS alone can't express "this caller may
-- update the row, but not these two specific columns" — the established
-- pattern for that in this codebase is a BEFORE UPDATE trigger comparing
-- OLD/NEW (see validate_lmra_assessment_update's identity-field-lock,
-- validate_scaffold_update's status-lock). Everyone else who can reach the
-- Edit Project page can still edit every other field there; these two are
-- simply read-only for them, enforced here (not just hidden client-side).
alter table public.projects
  add column country_code text,
  add column timezone text;

comment on column public.projects.country_code is
  'ISO 3166-1 alpha-2 (e.g. "US", "GB") — optional. Edit-permission: platform_super_admin + company_admin only (validate_project_location_settings_update).';
comment on column public.projects.timezone is
  'IANA timezone name (e.g. "America/New_York") — optional, validated against pg_timezone_names on write. Edit-permission: platform_super_admin + company_admin only (validate_project_location_settings_update).';

create or replace function public.validate_project_location_settings_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.country_code is distinct from old.country_code or new.timezone is distinct from old.timezone then
    if not (public.is_platform_super_admin() or public.has_company_role(new.company_id, 'company_admin')) then
      raise exception 'only a Platform Super Admin or Company Admin may change a project''s country/timezone';
    end if;
  end if;

  if new.country_code is not null and new.country_code !~ '^[A-Z]{2}$' then
    raise exception 'country_code must be a 2-letter ISO 3166-1 alpha-2 code';
  end if;

  if new.timezone is not null and not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'timezone must be a valid IANA timezone name';
  end if;

  return new;
end;
$$;

comment on function public.validate_project_location_settings_update() is
  'Field-level authorization RLS alone cannot express: country_code/timezone may only be changed by platform_super_admin or company_admin, even though projects_update''s RLS also lets operations_manager/the assigned Project Manager update the row''s other fields. Also validates the values themselves (2-letter code, real IANA timezone via pg_timezone_names) so invalid data can never land regardless of who set it.';

create trigger projects_validate_location_settings_update
  before update on public.projects
  for each row execute function public.validate_project_location_settings_update();
