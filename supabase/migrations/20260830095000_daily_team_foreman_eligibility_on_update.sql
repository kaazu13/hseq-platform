-- Operational audit finding (data-integrity gap, RPC-only enforcement):
-- daily_teams.foreman_employee_id eligibility (is_eligible_scaffold_foreman
-- — active employee, holds the company-wide 'foreman' role, AND has an
-- open team_assignments row with assignment_role='foreman' for this
-- project) is checked by validate_daily_team_insert() on INSERT and by
-- create_daily_team_for_foreman()/update_daily_team_with_foreman()'s own
-- application-level checks — but validate_daily_team_update() (the
-- BEFORE UPDATE trigger, the real defense-in-depth backstop every other
-- write path ultimately goes through) never re-validates it. A
-- manage-tier user (company_admin/operations_manager/the project's own
-- PM — daily_teams_update's own RLS grantees) can therefore PATCH
-- foreman_employee_id directly via PostgREST to ANY employee at all,
-- including one who has never held the foreman role or any team
-- assignment on this project — live-confirmed: a direct PATCH setting an
-- open team's foreman_employee_id to a plain worker succeeded with
-- HTTP 200 and persisted.
--
-- This exactly mirrors the working, established precedent already in
-- this schema for the identical "responsible foreman" concept on
-- scaffolds: validate_scaffold_update() (20260805090000_scaffold_team_
-- and_dimensions.sql) re-validates is_eligible_scaffold_foreman()
-- whenever responsible_foreman_id actually changes on UPDATE, not only
-- on INSERT. daily_teams.foreman_employee_id never got the equivalent
-- treatment when it was introduced as a direct column
-- (20260822090000_daily_team_foreman_roster.sql). This migration closes
-- that one gap, mirroring validate_scaffold_update()'s shape exactly —
-- it does NOT add a new "re-check eligibility on every unrelated edit"
-- rule (renaming a team, changing its shift/work area/activity while the
-- foreman column itself is untouched remains unaffected, exactly as
-- validate_scaffold_update() only checks responsible_foreman_id when
-- IT is the field that changed).
create or replace function public.validate_daily_team_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.project_id is distinct from old.project_id
    or new.work_date is distinct from old.work_date
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'daily team identity/creation fields cannot be changed';
  end if;

  if old.status = 'locked' and new.status = 'locked' then
    if new.name is distinct from old.name
      or new.shift is distinct from old.shift
      or new.work_area is distinct from old.work_area
      or new.activity is distinct from old.activity
      or new.foreman_employee_id is distinct from old.foreman_employee_id then
      raise exception 'a locked daily team is frozen — unlock it first (unlock_daily_team()) to make a corrected, audited change';
    end if;
  end if;

  if new.foreman_employee_id is distinct from old.foreman_employee_id
    and new.foreman_employee_id is not null
    and not public.is_eligible_scaffold_foreman(new.foreman_employee_id, new.company_id, new.project_id) then
    raise exception 'the selected employee does not hold the foreman role on this project';
  end if;

  return new;
end;
$$;

comment on function public.validate_daily_team_update() is
  'Locked-team freeze (name/shift/work_area/activity/foreman_employee_id immutable once locked) PLUS defense-in-depth: whenever foreman_employee_id actually changes (on an open team, via RPC or a raw UPDATE alike), the new value must be a genuinely eligible foreman for this project — mirrors validate_scaffold_update()''s identical responsible_foreman_id re-check shape, and validate_daily_team_insert()''s own check for the create path. Every other field may still be freely edited without re-validating an unrelated, unchanged foreman assignment.';
