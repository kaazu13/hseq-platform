-- Task 3 Part 6: phone-number system. `profiles.phone` already existed
-- (freely self-editable via updateOwnProfile) but had no format validation
-- and no way for anyone else to ever see it — profiles_select_own is the
-- ONLY select policy on profiles (RLS: id = auth.uid()), so a foreman/
-- coworker could never resolve another user's phone through any existing
-- channel. get_basic_employee_info() (the "safe channel" for teammate
-- display info) deliberately excludes phone/work_email/birth_date — see
-- 20260728090000_projects_and_teams.sql's header comment — so extending
-- THAT function would be the wrong move; this needs its own, narrower,
-- context-scoped resolver instead.
--
-- 1) E.164 format constraint on profiles.phone. No existing row currently
--    violates this (checked live before writing this migration).
alter table public.profiles
  add constraint profiles_phone_e164 check (phone is null or phone ~ '^\+[1-9]\d{1,14}$');

comment on constraint profiles_phone_e164 on public.profiles is
  'Phone, when set, must be a valid E.164 string (leading +, 2-15 digits, no spaces/punctuation) — enforced client-side by libphonenumber-js and here as the authoritative backstop.';

-- 2) get_daily_team_phone_numbers(): the ONLY channel that ever exposes
-- profiles.phone across users. Scoped to "own phone, Foreman's phone for
-- own team, coworkers only when sharing exact team/date" by construction:
-- the caller must themselves currently be the team's foreman OR a current
-- (removed_at is null) member of THIS EXACT daily_teams row (which already
-- pins one specific project + work_date) before anything is returned, and
-- even then only that same team's foreman + current members are resolved —
-- never a company-wide or cross-team/cross-date lookup.
create or replace function public.get_daily_team_phone_numbers(target_daily_team_id uuid)
returns table (employee_id uuid, phone text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_foreman_employee_id uuid;
  v_is_authorized boolean;
begin
  select foreman_employee_id into v_foreman_employee_id
  from public.daily_teams
  where id = target_daily_team_id;

  if not found then
    return;
  end if;

  select
    public.is_own_employee(v_foreman_employee_id)
    or exists (
      select 1 from public.daily_team_members dtm
      join public.employees e on e.id = dtm.employee_id
      where dtm.daily_team_id = target_daily_team_id
        and dtm.removed_at is null
        and e.profile_id = auth.uid()
    )
  into v_is_authorized;

  if not v_is_authorized then
    return;
  end if;

  return query
  select e.id, p.phone
  from public.employees e
  join public.profiles p on p.id = e.profile_id
  where e.id = v_foreman_employee_id

  union

  select e.id, p.phone
  from public.daily_team_members dtm
  join public.employees e on e.id = dtm.employee_id
  join public.profiles p on p.id = e.profile_id
  where dtm.daily_team_id = target_daily_team_id
    and dtm.removed_at is null;
end;
$$;

comment on function public.get_daily_team_phone_numbers(uuid) is
  'The ONLY cross-user channel for profiles.phone. Returns (employee_id, phone) for a daily team''s foreman + current members, but ONLY if the caller is themselves that exact team''s foreman or a current member of it — never broader. phone is null in the result for anyone who hasn''t set one; rows are still returned so the caller can distinguish "no phone on file" from "not authorized." SECURITY DEFINER: reads profiles cross-user, which profiles_select_own alone would never permit.';

revoke all on function public.get_daily_team_phone_numbers(uuid) from public, anon;
grant execute on function public.get_daily_team_phone_numbers(uuid) to authenticated;
