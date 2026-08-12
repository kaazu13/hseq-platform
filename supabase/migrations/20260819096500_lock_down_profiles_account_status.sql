-- CRITICAL FIX, found via review immediately after adding account_status
-- to profiles (20260819095000_platform_admin.sql): profiles_update_own's
-- WITH CHECK is only `id = auth.uid()` — it has NEVER restricted which
-- COLUMNS a user may change on their own row (this was harmless before
-- this milestone, when every profiles column WAS meant to be freely self-
-- editable: full_name, phone, active_company_id, active_project_id).
-- Adding account_status/account_status_changed_at/account_status_changed_by/
-- account_status_reason to the SAME table silently inherited that same
-- broad grant — meaning a banned/suspended user could issue a plain
-- `supabase.from('profiles').update({ account_status: 'active' })` client
-- call and RLS would allow it (the row belongs to them), completely
-- bypassing suspend_account()/ban_account(). Caught by re-reading
-- pg_policies before adding the theme-preference columns below (the same
-- review step that would have caught this for ANY future profiles
-- column addition) — fixed before any exploit path was ever reachable
-- from the application (no UI has ever exposed a raw profiles.update for
-- these columns).
create or replace function public.validate_profile_update()
returns trigger
language plpgsql
as $$
begin
  -- SECURITY DEFINER functions run with current_user temporarily switched
  -- to the function's OWNER (postgres in this project — confirmed via
  -- pg_roles.rolbypassrls = true for postgres) for the duration of their
  -- own execution; a plain authenticated-role client request never has
  -- current_user = 'postgres'. This reliably distinguishes "one of this
  -- migration's own suspend_account()/ban_account()/restore_account()
  -- RPCs is making this change" from "a raw client update slipped
  -- through the broad id = auth.uid() policy" — the ONLY two ways an
  -- UPDATE on this table's protected columns can ever be issued.
  if current_user <> 'postgres' then
    if new.account_status is distinct from old.account_status
      or new.account_status_changed_at is distinct from old.account_status_changed_at
      or new.account_status_changed_by is distinct from old.account_status_changed_by
      or new.account_status_reason is distinct from old.account_status_reason
    then
      raise exception 'account status fields cannot be changed via this path';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.validate_profile_update() is
  'Column-lockdown for profiles_update_own''s otherwise-unrestricted self-update grant — account_status and its audit fields may only change via the SECURITY DEFINER suspend_account()/ban_account()/restore_account() RPCs (detected via current_user = ''postgres'' during their execution), never a raw client update, even on one''s own row.';

create trigger profiles_validate_update
  before update on public.profiles
  for each row execute function public.validate_profile_update();
