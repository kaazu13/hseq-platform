-- Post-audit implementation package, Part 2 — real defect found while
-- building the Platform Settings page's platform_super_admin roster UI
-- (grant/revoke, wrapping the existing grant_platform_super_admin()/
-- revoke_platform_super_admin() from 20260819095000_platform_admin.sql).
--
-- ROOT CAUSE: neither function writes to audit_events OR security_events
-- — confirmed by inspection (zero audit_events/security_events references
-- in that entire migration). A GRANT is at least durably visible while
-- active (platform_super_admins.granted_at/granted_by/notes), but a
-- REVOKE deletes that row outright — after a revoke, there is LITERALLY
-- NO record anywhere in the system that platform-level access was ever
-- granted or later removed, for whom, by whom, or when. Every other
-- platform-admin mutation in this codebase (suspend/ban/restore accounts,
-- warnings, sessions-revoked) writes a security_events row for exactly
-- this reason; platform_super_admin grant/revoke is the one mutation in
-- that migration that was missed. "Every mutation must be audited" is a
-- hard requirement for this milestone's own new UI, and this is the most
-- security-sensitive mutation in the entire console (it grants/removes
-- the highest privilege level that exists) — fixing it here rather than
-- merely reporting it.
--
-- Fix: CREATE OR REPLACE both functions, unchanged in every other respect
-- (same signature, same authorization checks, same return value), adding
-- one audit_events insert each. company_id is null (platform-level, not
-- company-scoped — same reasoning as every other cross-company platform
-- RPC's audit_events row, e.g. create_company()'s own company_id = the
-- new company, which doesn't apply here since there is no company).

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

  insert into public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, changes)
  values (null, auth.uid(), 'create', 'platform_super_admin_grant', target_user_id, jsonb_build_object('notes', notes));

  return v_result;
end;
$$;

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

  insert into public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, changes)
  values (null, auth.uid(), 'delete', 'platform_super_admin_grant', target_user_id, jsonb_build_object('revoked', true));
end;
$$;

comment on function public.grant_platform_super_admin(uuid, text) is
  'Grants (or updates the notes on) a platform_super_admins row — the highest privilege level in the system. Now audited (Part 2 fix — was previously silent; see this migration''s header comment).';
comment on function public.revoke_platform_super_admin(uuid) is
  'Revokes a platform_super_admins row. Now audited (Part 2 fix) — the DELETE previously left no trace anywhere that access had ever been granted or removed.';
