-- RLS helper functions.
--
-- Both are SECURITY DEFINER, STABLE, and pin search_path explicitly. This
-- is required, not just defensive: is_organization_member() and
-- has_organization_role() are called FROM WITHIN RLS policies on
-- organization_memberships / membership_roles. If they were SECURITY
-- INVOKER, their own internal SELECT against those same tables would
-- re-trigger the calling policy, recursing indefinitely ("infinite
-- recursion detected in policy"). SECURITY DEFINER — running as the
-- function owner, which bypasses RLS on the standard Supabase role setup
-- — breaks that cycle cleanly. `set search_path = public, pg_temp` blocks
-- search_path hijacking (a caller-controlled schema earlier in the path
-- shadowing a table/function this definer-privileged function resolves
-- unqualified) — the classic SECURITY DEFINER privilege-escalation vector.
--
-- Both take an explicit organization_id parameter rather than relying on a
-- single "current active organization" claim, because that would require
-- a Custom Access Token Auth Hook (docs/ARCHITECTURE.md §3.2) configured
-- at the Supabase project/dashboard level, which is out of reach from a
-- migration file — see the implementation report for this milestone.
-- Real tenant isolation does not depend on that hook: every policy below
-- checks membership per-row, for whichever organization_id that row
-- belongs to, regardless of any "active" designation.

create or replace function public.is_organization_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = target_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

comment on function public.is_organization_member(uuid) is
  'True if the calling user has an ACTIVE membership in the given organization.';

create or replace function public.has_organization_role(target_org_id uuid, role_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r on r.id = mr.role_id
    where m.organization_id = target_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and r.name = role_name
  );
$$;

comment on function public.has_organization_role(uuid, text) is
  'True if the calling user has an ACTIVE membership in the given organization AND holds the named role there. Implements the role-union check described in docs/ARCHITECTURE.md §6 one role at a time.';

-- Neither function is meant to be callable as a public RPC endpoint (both
-- take auth.uid() from the session implicitly and are internal building
-- blocks for policies, not an API surface) — revoke the default PUBLIC
-- EXECUTE grant and restrict to `authenticated`, which is also all that's
-- needed for the SQL engine to evaluate them from within an RLS policy.
revoke execute on function public.is_organization_member(uuid) from public;
revoke execute on function public.has_organization_role(uuid, text) from public;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.has_organization_role(uuid, text) to authenticated;
