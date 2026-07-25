-- Trigger functions for: updated_at maintenance, auto-creating a profile
-- on signup, and enforcing audit_events immutability.

-- 1) updated_at maintenance ---------------------------------------------
-- Plain SECURITY INVOKER — it only mutates the row already being written
-- by the calling statement, so it needs no elevated privilege. search_path
-- is still pinned defensively, consistent with every function below.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Generic BEFORE UPDATE trigger: stamps updated_at = now() on every row update.';

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger organization_memberships_set_updated_at
  before update on public.organization_memberships
  for each row execute function public.set_updated_at();

-- 2) Auto-create a profile when a Supabase Auth user is created ----------
-- Must be SECURITY DEFINER: this fires as part of an INSERT into
-- auth.users performed by Supabase's internal auth service, long before
-- any RLS-relevant session context exists for the new user. SECURITY
-- DEFINER runs it as the function owner (the migration-applying role,
-- which — per standard Supabase project setup — has BYPASSRLS), so the
-- insert into public.profiles succeeds regardless of that table's RLS
-- policies. full_name falls back to the user's email, then '', so the
-- NOT NULL constraint is always satisfiable even when no display name was
-- supplied at signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email, '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates the matching public.profiles row whenever a new auth.users row is inserted.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) audit_events immutability -------------------------------------------
-- Deliberately unconditional and role-agnostic: this is a second,
-- independent enforcement layer on top of RLS (see the "no UPDATE/DELETE
-- policy" note in 20260725090900_rls_policies.sql) so that even a role
-- that bypasses RLS entirely (service_role, postgres) cannot alter or
-- remove audit history through the normal DML path.
create or replace function public.prevent_audit_event_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'audit_events records are immutable and cannot be %', tg_op
    using errcode = '0A000';
end;
$$;

comment on function public.prevent_audit_event_mutation() is
  'Unconditionally rejects UPDATE/DELETE on audit_events, for every role.';

create trigger audit_events_prevent_update
  before update on public.audit_events
  for each row execute function public.prevent_audit_event_mutation();

create trigger audit_events_prevent_delete
  before delete on public.audit_events
  for each row execute function public.prevent_audit_event_mutation();
