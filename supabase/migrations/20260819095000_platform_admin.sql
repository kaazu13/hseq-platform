-- Platform Administrator foundation (Phases 12-14). docs/DATABASE_SCHEMA.md
-- and docs/ARCHITECTURE.md have long documented `platform_super_admin` as a
-- role-catalogue row with NO working authorization infrastructure — no
-- allow-list table, no is_platform_super_admin() helper, no non-company-
-- scoped session check anywhere. This migration BUILDS that documented-but-
-- unbuilt mechanism; it does not invent a new role (the catalogue row
-- already exists — see public.roles).
--
-- Deliberately kept SEPARATE from company/project-scoped authorization:
-- platform_super_admins is a global allow-list, not a company_memberships
-- row, matching the explicit "do not confuse platform administrator /
-- company-level management / project management" instruction.

create table public.platform_super_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles (id) on delete set null,
  notes text
);

comment on table public.platform_super_admins is
  'Global platform-administrator allow-list — NOT company-scoped, NOT a company_memberships row. Membership here is what is_platform_super_admin() checks. Mutated only via bootstrap_first_platform_super_admin() (service-role, cold-start only) and grant_platform_super_admin()/revoke_platform_super_admin() (existing platform admins only) below — never a direct RLS insert/update/delete grant to `authenticated`.';

alter table public.platform_super_admins enable row level security;
alter table public.platform_super_admins force row level security;

grant select on public.platform_super_admins to authenticated;

create or replace function public.is_platform_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.platform_super_admins where user_id = auth.uid());
$$;

comment on function public.is_platform_super_admin() is
  'The one true "is this caller a platform-level administrator" check — mirrors is_company_member()''s exact SECURITY DEFINER shape/reasoning, but global rather than company-scoped. Used by every RLS policy/RPC in this migration.';

revoke all on function public.is_platform_super_admin() from public, anon;
grant execute on function public.is_platform_super_admin() to authenticated;

create policy platform_super_admins_select
  on public.platform_super_admins
  for select
  to authenticated
  using (public.is_platform_super_admin());

-- Service-role-only bootstrap, mirroring bootstrap_first_owner()'s exact
-- established convention (supabase/migrations/20260804090000_first_owner_bootstrap.sql):
-- handles ONLY the cold-start (zero existing platform admins) case; every
-- subsequent grant goes through grant_platform_super_admin() below, called
-- BY an existing platform admin, never re-using this function.
create or replace function public.bootstrap_first_platform_super_admin(target_user_id uuid, notes text default null)
returns public.platform_super_admins
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing_count int;
  v_result public.platform_super_admins;
begin
  select count(*) into v_existing_count from public.platform_super_admins;
  if v_existing_count > 0 then
    raise exception 'a platform super admin already exists — bootstrap_first_platform_super_admin() only handles the cold-start case; use grant_platform_super_admin() (as an existing platform super admin) instead';
  end if;

  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'user % not found', target_user_id;
  end if;

  insert into public.platform_super_admins (user_id, granted_by, notes)
  values (target_user_id, target_user_id, notes)
  returning * into v_result;

  return v_result;
end;
$$;

comment on function public.bootstrap_first_platform_super_admin(uuid, text) is
  'Cold-start only, service-role only — mirrors bootstrap_first_owner(). Run once, out-of-band (e.g. `supabase db query` with the service-role key), never reachable from the application.';

revoke all on function public.bootstrap_first_platform_super_admin(uuid, text) from public, anon, authenticated;
grant execute on function public.bootstrap_first_platform_super_admin(uuid, text) to service_role;

create or replace function public.grant_platform_super_admin(target_user_id uuid, notes text default null)
returns public.platform_super_admins
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result public.platform_super_admins;
begin
  if not public.is_platform_super_admin() then
    raise exception 'only an existing platform super administrator can grant this role';
  end if;
  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'user % not found', target_user_id;
  end if;

  insert into public.platform_super_admins (user_id, granted_by, notes)
  values (target_user_id, auth.uid(), notes)
  on conflict (user_id) do update set notes = excluded.notes
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.grant_platform_super_admin(uuid, text) from public, anon;
grant execute on function public.grant_platform_super_admin(uuid, text) to authenticated;

create or replace function public.revoke_platform_super_admin(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_super_admin() then
    raise exception 'only an existing platform super administrator can revoke this role';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'cannot revoke your own platform super administrator access';
  end if;

  delete from public.platform_super_admins where user_id = target_user_id;
end;
$$;

revoke all on function public.revoke_platform_super_admin(uuid) from public, anon;
grant execute on function public.revoke_platform_super_admin(uuid) to authenticated;

-- ============================================================================
-- Account state (Phase 12) — enforced server-side in lib/auth/session.ts's
-- getCurrentUser(), NOT merely by hiding UI: a suspended/banned user's
-- existing session cookie stops granting access on their very next request
-- regardless of the cookie's own validity.
-- ============================================================================
create type public.account_status as enum ('active', 'suspended', 'banned');

alter table public.profiles add column account_status public.account_status not null default 'active';
alter table public.profiles add column account_status_changed_at timestamptz;
alter table public.profiles add column account_status_changed_by uuid references public.profiles (id) on delete set null;
alter table public.profiles add column account_status_reason text;

comment on column public.profiles.account_status is
  'Platform-level account state — active/suspended/banned. NOT a company_memberships.status (that is per-company; this is global). Checked on every request by getCurrentUser() (lib/auth/session.ts), not only at login.';

-- ============================================================================
-- Security/login history (Phase 14) — IP address is a security SIGNAL, not
-- proof of identity. No passwords/tokens/cookies are ever logged.
-- ============================================================================
create type public.security_event_type as enum (
  'login_success', 'login_failed', 'logout',
  'account_suspended', 'account_banned', 'account_restored',
  'platform_warning_issued', 'sessions_revoked'
);

create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  -- null for login_failed (no session/identity exists yet at that point).
  user_id uuid references public.profiles (id) on delete cascade,
  event_type public.security_event_type not null,
  actor_user_id uuid references public.profiles (id) on delete set null,
  ip_address inet,
  user_agent text,
  detail text,
  created_at timestamptz not null default now()
);

comment on table public.security_events is
  'Append-only security/account audit log (Phase 14). IP address is a security signal, NOT proof of identity — never treat it as such. No passwords, auth tokens, cookies, or other credentials are ever written here. Retention: no automatic purge job exists in this codebase (no scheduled-job infrastructure) — a periodic manual/external purge beyond ~1 year is the recommended retention approach; disclosed, not implemented, since building a cron/scheduled-task system is out of scope for this milestone.';

create index security_events_user_id_idx on public.security_events (user_id, created_at desc);

alter table public.security_events enable row level security;
alter table public.security_events force row level security;

grant select on public.security_events to authenticated;

-- "Do not expose security/login history to ordinary employees or unrelated
-- company users" — platform admins see everything; anyone else sees only
-- their OWN events (their own login/logout/account-status history).
create policy security_events_select
  on public.security_events
  for select
  to authenticated
  using (public.is_platform_super_admin() or user_id = auth.uid());

-- All writes go through these narrow RPCs (SECURITY DEFINER, no direct
-- table grant to `authenticated`) — never a raw client insert.
create or replace function public.log_login_success(target_ip inet default null, target_user_agent text default null)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.security_events (user_id, event_type, actor_user_id, ip_address, user_agent)
  values (auth.uid(), 'login_success', auth.uid(), target_ip, left(target_user_agent, 500));
$$;

revoke all on function public.log_login_success(inet, text) from public, anon;
grant execute on function public.log_login_success(inet, text) to authenticated;

create or replace function public.log_logout(target_ip inet default null, target_user_agent text default null)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.security_events (user_id, event_type, actor_user_id, ip_address, user_agent)
  values (auth.uid(), 'logout', auth.uid(), target_ip, left(target_user_agent, 500));
$$;

revoke all on function public.log_logout(inet, text) from public, anon;
grant execute on function public.log_logout(inet, text) to authenticated;

-- Callable pre-session (a failed login has no auth.uid() yet) — the one
-- deliberately anon-grantable function in this migration. Stores only a
-- truncated, non-identity-asserting detail string, never a resolvable
-- user_id (we don't know if the attempted email is even real — "do not
-- reveal whether the email exists" from modules/auth/actions.ts's own
-- header comment applies here too).
create or replace function public.log_login_failed(attempted_email text default null, target_ip inet default null, target_user_agent text default null)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.security_events (user_id, event_type, actor_user_id, ip_address, user_agent, detail)
  values (null, 'login_failed', null, target_ip, left(target_user_agent, 500), 'attempted: ' || left(coalesce(attempted_email, '(none)'), 200));
$$;

revoke all on function public.log_login_failed(text, inet, text) from public;
grant execute on function public.log_login_failed(text, inet, text) to anon, authenticated;

create or replace function public.log_sessions_revoked(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator can revoke sessions';
  end if;
  insert into public.security_events (user_id, event_type, actor_user_id)
  values (target_user_id, 'sessions_revoked', auth.uid());
end;
$$;

revoke all on function public.log_sessions_revoked(uuid) from public, anon;
grant execute on function public.log_sessions_revoked(uuid) to authenticated;

-- ============================================================================
-- Account controls (Phase 12) — suspend/ban/restore. Each is a platform-
-- admin-only SECURITY DEFINER mutation (profiles has no RLS UPDATE policy
-- allowing anyone to touch another user's row — deliberately not widened;
-- this narrow, explicitly-checked function is the sanctioned exception,
-- same reasoning as every other SECURITY DEFINER RPC in this codebase).
-- ============================================================================
create or replace function public.suspend_account(target_user_id uuid, target_reason text)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result public.profiles;
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator can suspend an account';
  end if;
  if target_reason is null or btrim(target_reason) = '' then
    raise exception 'a reason is required to suspend an account';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'cannot suspend your own account';
  end if;

  update public.profiles
  set account_status = 'suspended', account_status_changed_at = now(), account_status_changed_by = auth.uid(), account_status_reason = target_reason
  where id = target_user_id
  returning * into v_result;

  if v_result.id is null then
    raise exception 'user % not found', target_user_id;
  end if;

  insert into public.security_events (user_id, event_type, actor_user_id, detail) values (target_user_id, 'account_suspended', auth.uid(), target_reason);

  return v_result;
end;
$$;

revoke all on function public.suspend_account(uuid, text) from public, anon;
grant execute on function public.suspend_account(uuid, text) to authenticated;

create or replace function public.ban_account(target_user_id uuid, target_reason text)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result public.profiles;
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator can ban an account';
  end if;
  if target_reason is null or btrim(target_reason) = '' then
    raise exception 'a reason is required to ban an account';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'cannot ban your own account';
  end if;

  update public.profiles
  set account_status = 'banned', account_status_changed_at = now(), account_status_changed_by = auth.uid(), account_status_reason = target_reason
  where id = target_user_id
  returning * into v_result;

  if v_result.id is null then
    raise exception 'user % not found', target_user_id;
  end if;

  insert into public.security_events (user_id, event_type, actor_user_id, detail) values (target_user_id, 'account_banned', auth.uid(), target_reason);

  return v_result;
end;
$$;

revoke all on function public.ban_account(uuid, text) from public, anon;
grant execute on function public.ban_account(uuid, text) to authenticated;

create or replace function public.restore_account(target_user_id uuid, target_reason text default null)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result public.profiles;
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator can restore an account';
  end if;

  update public.profiles
  set account_status = 'active', account_status_changed_at = now(), account_status_changed_by = auth.uid(), account_status_reason = target_reason
  where id = target_user_id
  returning * into v_result;

  if v_result.id is null then
    raise exception 'user % not found', target_user_id;
  end if;

  insert into public.security_events (user_id, event_type, actor_user_id, detail) values (target_user_id, 'account_restored', auth.uid(), target_reason);

  return v_result;
end;
$$;

revoke all on function public.restore_account(uuid, text) from public, anon;
grant execute on function public.restore_account(uuid, text) to authenticated;

-- ============================================================================
-- Platform Warnings (Phase 13) — completely separate from Safety
-- Observations. Never surfaced inside project HSEQ observation statistics
-- (no FK/relationship to safety_observations anywhere).
-- ============================================================================
create table public.platform_warnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  issued_by uuid not null references public.profiles (id),
  reason text not null,
  issued_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  constraint platform_warnings_reason_required check (btrim(reason) <> '')
);

comment on table public.platform_warnings is
  'Platform-level behavioral warnings issued by a platform super administrator (Phase 13). Deliberately NOT a Safety Observation — a completely separate table/module, never joined into or shown inside project HSEQ observation statistics.';

create index platform_warnings_user_id_idx on public.platform_warnings (user_id, issued_at desc);

alter table public.platform_warnings enable row level security;
alter table public.platform_warnings force row level security;

grant select on public.platform_warnings to authenticated;

create policy platform_warnings_select
  on public.platform_warnings
  for select
  to authenticated
  using (public.is_platform_super_admin() or user_id = auth.uid());

create or replace function public.issue_platform_warning(target_user_id uuid, target_reason text)
returns public.platform_warnings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result public.platform_warnings;
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator can issue a platform warning';
  end if;
  if target_reason is null or btrim(target_reason) = '' then
    raise exception 'a reason is required to issue a platform warning';
  end if;
  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'user % not found', target_user_id;
  end if;

  insert into public.platform_warnings (user_id, issued_by, reason)
  values (target_user_id, auth.uid(), target_reason)
  returning * into v_result;

  insert into public.security_events (user_id, event_type, actor_user_id, detail) values (target_user_id, 'platform_warning_issued', auth.uid(), target_reason);

  return v_result;
end;
$$;

revoke all on function public.issue_platform_warning(uuid, text) from public, anon;
grant execute on function public.issue_platform_warning(uuid, text) to authenticated;

create or replace function public.acknowledge_platform_warning(target_warning_id uuid)
returns public.platform_warnings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result public.platform_warnings;
begin
  update public.platform_warnings
  set acknowledged_at = now()
  where id = target_warning_id and user_id = auth.uid() and acknowledged_at is null
  returning * into v_result;

  if v_result.id is null then
    raise exception 'open platform warning % not found for you', target_warning_id;
  end if;

  return v_result;
end;
$$;

revoke all on function public.acknowledge_platform_warning(uuid) from public, anon;
grant execute on function public.acknowledge_platform_warning(uuid) to authenticated;

-- ============================================================================
-- Platform-admin read helpers: search accounts + view a user's memberships/
-- project assignments (Phase 12's "view memberships/project assignments
-- where existing permissions allow"). SECURITY DEFINER + explicit
-- is_platform_super_admin() gate, since this deliberately crosses company
-- boundaries (a platform admin, by definition, is not scoped to one company).
-- ============================================================================
create or replace function public.platform_admin_search_accounts(search_query text default null, limit_count int default 50)
returns table (id uuid, full_name text, email text, account_status public.account_status, account_status_reason text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator can search accounts';
  end if;

  return query
  select p.id, p.full_name, u.email::text, p.account_status, p.account_status_reason, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where search_query is null or btrim(search_query) = ''
     or p.full_name ilike '%' || search_query || '%'
     or u.email ilike '%' || search_query || '%'
  order by p.created_at desc
  limit least(coalesce(limit_count, 50), 200);
end;
$$;

revoke all on function public.platform_admin_search_accounts(text, int) from public, anon;
grant execute on function public.platform_admin_search_accounts(text, int) to authenticated;

create or replace function public.platform_admin_get_memberships(target_user_id uuid)
returns table (company_id uuid, company_name text, membership_status public.membership_status, role_names text[])
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator can view account memberships';
  end if;

  return query
  select c.id, c.name, cm.status, array_agg(distinct r.name order by r.name)
  from public.company_memberships cm
  join public.companies c on c.id = cm.company_id
  left join public.membership_roles mr on mr.membership_id = cm.id
  left join public.roles r on r.id = mr.role_id
  where cm.user_id = target_user_id
  group by c.id, c.name, cm.status;
end;
$$;

revoke all on function public.platform_admin_get_memberships(uuid) from public, anon;
grant execute on function public.platform_admin_get_memberships(uuid) to authenticated;
