-- Item 10: ordinary users (employees, Foremen, HSE roles, Inspectors,
-- Project Managers, company-level management) must NOT be able to change
-- their own display name. profiles_update_own's RLS is row-scoped only
-- (`id = auth.uid()`) — it has never restricted which COLUMNS a user may
-- change on their own row (the same class of gap
-- 20260819096500_lock_down_profiles_account_status.sql already fixed for
-- account_status). This extends that SAME trigger (never a second,
-- competing lockdown mechanism) to also freeze full_name outside of a
-- SECURITY DEFINER admin path.

create or replace function public.validate_profile_update()
returns trigger
language plpgsql
as $$
begin
  -- SECURITY DEFINER functions run with current_user temporarily switched
  -- to the function's OWNER (postgres) for the duration of their own
  -- execution — see admin_update_profile_name() below, the ONE authorized
  -- path a name may change through.
  if current_user <> 'postgres' then
    if new.account_status is distinct from old.account_status
      or new.account_status_changed_at is distinct from old.account_status_changed_at
      or new.account_status_changed_by is distinct from old.account_status_changed_by
      or new.account_status_reason is distinct from old.account_status_reason
    then
      raise exception 'account status fields cannot be changed via this path';
    end if;

    if new.full_name is distinct from old.full_name then
      raise exception 'your name can only be changed by a Platform Super Admin';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.validate_profile_update() is
  'Column-lockdown for profiles_update_own''s otherwise-unrestricted self-update grant — account_status/its audit fields and full_name may only change via SECURITY DEFINER RPCs (suspend_account()/ban_account()/restore_account()/admin_update_profile_name(), detected via current_user = ''postgres'' during their execution), never a raw client update, even on one''s own row. modules/companies/actions.ts''s updateOwnProfile() no longer sends full_name at all (item 10) — this trigger is the real, non-bypassable enforcement regardless of what any client ever sends.';

-- The ONE authorized path to change ANY user's name — Platform Super
-- Admin only, re-checked here (not merely at the app layer), same
-- established pattern as suspend_account()/ban_account()/restore_account()
-- (supabase/migrations/20260819095000_platform_admin.sql).
create or replace function public.admin_update_profile_name(target_user_id uuid, target_full_name text)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles;
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a Platform Super Admin may change a user''s name';
  end if;

  if target_full_name is null or btrim(target_full_name) = '' then
    raise exception 'a name is required';
  end if;

  update public.profiles
  set full_name = btrim(target_full_name)
  where id = target_user_id
  returning * into v_profile;

  if v_profile.id is null then
    raise exception 'user % not found', target_user_id;
  end if;

  return v_profile;
end;
$$;

comment on function public.admin_update_profile_name(uuid, text) is
  'Item 10: the dedicated, authorized path for a Platform Super Admin to change ANY user''s display name — is_platform_super_admin() re-checked here (SECURITY DEFINER, so it can reach a row the caller does not own), never merely an app-layer gate. Fires validate_profile_update() like any other UPDATE on profiles; current_user = ''postgres'' during this function''s own execution is what lets the full_name change itself through that trigger.';

revoke all on function public.admin_update_profile_name(uuid, text) from public, anon;
grant execute on function public.admin_update_profile_name(uuid, text) to authenticated;
