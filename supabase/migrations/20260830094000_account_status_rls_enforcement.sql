-- Operational audit finding (Phase 32, data integrity — CONFIRMED live,
-- not just by static review): profiles.account_status ('suspended'/
-- 'banned') is checked by getCurrentUser() (lib/auth/session.ts) on every
-- Next.js request, and that check is real — a suspended user's app-layer
-- session is correctly signed out and every page/action correctly 401s.
-- But NO RLS policy or RPC anywhere in this schema ever checks
-- account_status — it exists only as an application-layer gate. Live-
-- confirmed: after setting a test user's account_status to 'suspended',
-- they could still (a) obtain a brand-new valid access token via the
-- ordinary Supabase Auth password-grant endpoint (account_status is a
-- custom app table, invisible to Supabase Auth's own login flow), (b)
-- successfully SELECT company data directly via PostgREST, and (c)
-- successfully call a real mutating RPC (report_absence) and have it
-- persist — all while completely bypassing the Next.js app entirely. A
-- suspended/banned account is not actually locked out at all against
-- anyone who talks to the API directly (trivial with a browser's devtools
-- or curl) — only against the web UI. Given a real reason to suspend an
-- account is very often "we no longer trust this person with access" (a
-- termination, a compromised account), this makes the platform's own
-- suspend control non-functional as a real security boundary.
--
-- Fix: push the SAME check down into the two SECURITY DEFINER identity
-- helpers virtually every RLS policy and RPC in this schema is already
-- built on (is_company_member() and is_platform_super_admin()) — a single,
-- centralized change that cascades to every table/policy without touching
-- each one individually, exactly mirroring how these functions already
-- serve as the shared "is this caller allowed at all" chokepoint. A
-- suspended/banned user's calling identity now fails is_company_member()
-- for every company and is_platform_super_admin(), so RLS denies them
-- everywhere it already denied a non-member — no new denial shape, just a
-- previously-missing one.
create or replace function public.is_company_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.company_memberships m
    join public.profiles p on p.id = m.user_id
    where m.company_id = target_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and p.account_status = 'active'
  );
$$;

comment on function public.is_company_member(uuid) is
  'True if the calling user has an ACTIVE membership in the given company AND their platform-level account_status is still active (suspended/banned accounts fail this, and therefore every RLS policy built on it, even with a valid, unexpired JWT — see 20260830094000_account_status_rls_enforcement.sql).';

create or replace function public.is_platform_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.platform_super_admins psa
    join public.profiles p on p.id = psa.user_id
    where psa.user_id = auth.uid()
      and p.account_status = 'active'
  );
$$;

comment on function public.is_platform_super_admin() is
  'The one true "is this caller a platform-level administrator" check — mirrors is_company_member()''s exact SECURITY DEFINER shape/reasoning, but global rather than company-scoped. Used by every RLS policy/RPC in this migration. Also requires account_status = ''active'' — see 20260830094000_account_status_rls_enforcement.sql.';
