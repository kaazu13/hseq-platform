-- Post-audit implementation package, Part 2 — Platform Admin console.
-- Read-side foundation only: every list/detail/aggregate query the new
-- console pages need, as SECURITY DEFINER RPCs following the EXACT
-- existing platform_admin_* convention (platform_admin_search_accounts /
-- platform_admin_get_memberships, 20260819095000_platform_admin.sql) —
-- explicit is_platform_super_admin() gate, bounded LIMIT on every list,
-- no unbounded scans. No account-control/security-event mutation logic is
-- touched (that already exists and stays as-is).
--
-- WHY THIS IS NEEDED (confirmed by inspection before writing this
-- migration, not assumed): none of companies/employees/projects/
-- company_memberships/membership_roles' SELECT policies grant
-- is_platform_super_admin() a bypass — every one of them is scoped to
-- "a member of this company" (is_organization_member/is_company_member),
-- which a platform super admin, by definition/design, usually is not.
-- Confirmed for: companies_select_active_member, employees_select_
-- managers_or_own_record, projects_select, organization_memberships_
-- select_own_or_active_member (now company_memberships_...), membership_
-- roles_select_own_or_active_member. Every one of the tables already
-- fixed with a platform-admin bypass (security_events, platform_warnings,
-- roles, permissions, role_permissions, company_invitations,
-- company_subscriptions) got it because a prior migration explicitly
-- added it — these five never did. Without the RPCs below, a real
-- platform_super_admin session gets an empty result (RLS silently filters
-- everything out) from a plain client-side select against any of them.
--
-- REAL DEFECT FOUND + FIXED (root cause below, §0): audit_events_select_
-- authorized_members has the exact same gap — is_platform_super_admin()
-- was never added to it, unlike every sibling table. This directly
-- blocks the Audit Log page this milestone requires, and is otherwise
-- indistinguishable in kind from the other five tables above — a platform
-- operator being unable to view the platform's OWN audit trail at all is
-- a real, user-facing gap, not a hypothetical. Fixed the same way every
-- other instance in this codebase was fixed: `alter policy ... or
-- is_platform_super_admin()`, changing nothing else about existing
-- company_admin/hseq_manager access.

-- ============================================================================
-- 0) Defect fix: audit_events readable by a platform super admin.
-- ============================================================================
alter policy audit_events_select_authorized_members
  on public.audit_events
  using (
    public.is_platform_super_admin()
    or (
      company_id is not null
      and (
        public.has_company_role(company_id, 'company_admin')
        or public.has_company_role(company_id, 'hseq_manager')
      )
    )
  );

comment on policy audit_events_select_authorized_members on public.audit_events is
  'Company Admin and HSEQ Manager can view their OWN company''s audit trail; a platform super administrator can view every company''s (Part 2 of the post-audit implementation package — this bypass was missing here even though every sibling platform-admin-relevant table already has it, confirmed by inspection; see this migration''s header comment).';

-- ============================================================================
-- 1) Overview aggregate stats — one round trip, bounded by construction
--    (every branch is a single COUNT, never a row scan returned to the
--    client).
-- ============================================================================
create or replace function public.platform_admin_get_overview_stats()
returns table (
  active_companies bigint,
  trial_companies bigint,
  suspended_companies bigint,
  active_projects bigint,
  total_employees bigint,
  active_employees bigint,
  activated_users bigint,
  pending_invitations bigint,
  suspended_accounts bigint,
  banned_accounts bigint,
  active_platform_warnings bigint,
  companies_without_admin_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator can view platform overview statistics';
  end if;

  return query select
    (select count(*) from public.companies where status = 'active' and deleted_at is null),
    (select count(*) from public.companies where status = 'trial' and deleted_at is null),
    (select count(*) from public.companies where status = 'suspended' and deleted_at is null),
    (select count(*) from public.projects where status = 'active'),
    (select count(*) from public.employees),
    (select count(*) from public.employees where employment_status = 'active'),
    (select count(*) from public.profiles),
    (select count(*) from public.company_invitations where status = 'pending'),
    (select count(*) from public.profiles where account_status = 'suspended'),
    (select count(*) from public.profiles where account_status = 'banned'),
    (select count(*) from public.platform_warnings where acknowledged_at is null),
    (select count(*) from public.companies c where c.deleted_at is null and not exists (
      select 1 from public.company_memberships cm
      join public.membership_roles mr on mr.membership_id = cm.id
      join public.roles r on r.id = mr.role_id
      where cm.company_id = c.id and cm.status = 'active' and r.name = 'company_admin'
    ));
end;
$$;

comment on function public.platform_admin_get_overview_stats() is
  'Part 2 Overview page — every branch is a bounded COUNT(*), no unbounded row scan is ever returned. "activated_users" = count(profiles) — every profiles row is 1:1 with a real auth.users row by construction (handle_new_user() trigger, see 20260725090200_profiles.sql), so this is exactly "accounts with a real login," distinct from total employee RECORDS (which may include draft/invited rows with no login yet).';

revoke all on function public.platform_admin_get_overview_stats() from public, anon;
grant execute on function public.platform_admin_get_overview_stats() to authenticated;

-- ============================================================================
-- 2) Companies with NO active company_admin membership — required as its
--    own explicit surface (Overview card/list + Companies page flag).
-- ============================================================================
create or replace function public.platform_admin_list_companies_without_admin(limit_count int default 100)
returns table (id uuid, name text, status public.company_status, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator can list companies';
  end if;

  return query
  select c.id, c.name, c.status, c.created_at
  from public.companies c
  where c.deleted_at is null
    and not exists (
      select 1 from public.company_memberships cm
      join public.membership_roles mr on mr.membership_id = cm.id
      join public.roles r on r.id = mr.role_id
      where cm.company_id = c.id and cm.status = 'active' and r.name = 'company_admin'
    )
  order by c.created_at desc
  limit least(coalesce(limit_count, 100), 500);
end;
$$;

revoke all on function public.platform_admin_list_companies_without_admin(int) from public, anon;
grant execute on function public.platform_admin_list_companies_without_admin(int) to authenticated;

-- ============================================================================
-- 3) Companies list (paginated, searchable) — per-row aggregates are cheap
--    because they only ever run over the current PAGE of companies
--    (limit_count rows), never the whole table.
-- ============================================================================
create or replace function public.platform_admin_list_companies(
  search_query text default null,
  limit_count int default 20,
  offset_count int default 0
)
returns table (
  id uuid,
  name text,
  slug text,
  status public.company_status,
  logo_storage_path text,
  created_at timestamptz,
  active_employee_count bigint,
  activated_user_count bigint,
  active_project_count bigint,
  pending_invitation_count bigint,
  admin_names text[],
  subscription_plan_name text,
  subscription_status public.company_subscription_status,
  employee_limit integer,
  project_limit integer,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator can list companies';
  end if;

  return query
  select
    c.id, c.name, c.slug, c.status, c.logo_storage_path, c.created_at,
    (select count(*) from public.employees e where e.company_id = c.id and e.employment_status = 'active') as active_employee_count,
    (select count(*) from public.company_memberships cm where cm.company_id = c.id and cm.status = 'active') as activated_user_count,
    (select count(*) from public.projects pr where pr.company_id = c.id and pr.status = 'active') as active_project_count,
    (select count(*) from public.company_invitations ci where ci.company_id = c.id and ci.status = 'pending') as pending_invitation_count,
    (
      select coalesce(array_agg(distinct pf.full_name order by pf.full_name), array[]::text[])
      from public.company_memberships cm2
      join public.membership_roles mr2 on mr2.membership_id = cm2.id
      join public.roles r2 on r2.id = mr2.role_id
      join public.profiles pf on pf.id = cm2.user_id
      where cm2.company_id = c.id and cm2.status = 'active' and r2.name = 'company_admin'
    ) as admin_names,
    cs.plan_name,
    cs.subscription_status,
    cs.employee_limit,
    cs.project_limit,
    count(*) over() as total_count
  from public.companies c
  left join public.company_subscriptions cs on cs.company_id = c.id
  where c.deleted_at is null
    and (search_query is null or btrim(search_query) = '' or c.name ilike '%' || search_query || '%' or c.slug ilike '%' || search_query || '%')
  order by c.name asc
  limit least(coalesce(limit_count, 20), 100) offset greatest(coalesce(offset_count, 0), 0);
end;
$$;

comment on function public.platform_admin_list_companies(text, int, int) is
  'Part 2 Companies list + Billing page (both reuse this — Billing needs plan/status/limits, which are already selected here). total_count via window function so the caller can compute page count without a second round trip. Per-row aggregate subqueries only ever execute over the current page (limit_count, capped at 100), never the full companies table.';

revoke all on function public.platform_admin_list_companies(text, int, int) from public, anon;
grant execute on function public.platform_admin_list_companies(text, int, int) to authenticated;

-- ============================================================================
-- 4) Lightweight company selector (name/status only) — for dropdowns
--    (Roles & Permissions company picker) where the heavier aggregates
--    above would be wasted work.
-- ============================================================================
create or replace function public.platform_admin_search_companies(search_query text default null, limit_count int default 20)
returns table (id uuid, name text, status public.company_status)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator can search companies';
  end if;

  return query
  select c.id, c.name, c.status
  from public.companies c
  where c.deleted_at is null
    and (search_query is null or btrim(search_query) = '' or c.name ilike '%' || search_query || '%')
  order by c.name asc
  limit least(coalesce(limit_count, 20), 50);
end;
$$;

revoke all on function public.platform_admin_search_companies(text, int) from public, anon;
grant execute on function public.platform_admin_search_companies(text, int) to authenticated;

-- ============================================================================
-- 5) Company detail — single-row aggregate (employees/projects/
--    memberships/invitations counts) for the company profile page.
-- ============================================================================
create or replace function public.platform_admin_get_company_detail(target_company_id uuid)
returns table (
  id uuid,
  name text,
  slug text,
  status public.company_status,
  logo_storage_path text,
  employee_number_prefix text,
  created_at timestamptz,
  total_employees bigint,
  active_employees bigint,
  active_memberships bigint,
  active_projects bigint,
  pending_invitations bigint,
  admin_names text[]
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator can view company detail';
  end if;

  return query
  select
    c.id, c.name, c.slug, c.status, c.logo_storage_path, c.employee_number_prefix, c.created_at,
    (select count(*) from public.employees e where e.company_id = c.id),
    (select count(*) from public.employees e where e.company_id = c.id and e.employment_status = 'active'),
    (select count(*) from public.company_memberships cm where cm.company_id = c.id and cm.status = 'active'),
    (select count(*) from public.projects pr where pr.company_id = c.id and pr.status = 'active'),
    (select count(*) from public.company_invitations ci where ci.company_id = c.id and ci.status = 'pending'),
    (
      select coalesce(array_agg(distinct pf.full_name order by pf.full_name), array[]::text[])
      from public.company_memberships cm2
      join public.membership_roles mr2 on mr2.membership_id = cm2.id
      join public.roles r2 on r2.id = mr2.role_id
      join public.profiles pf on pf.id = cm2.user_id
      where cm2.company_id = c.id and cm2.status = 'active' and r2.name = 'company_admin'
    )
  from public.companies c
  where c.id = target_company_id and c.deleted_at is null;
end;
$$;

revoke all on function public.platform_admin_get_company_detail(uuid) from public, anon;
grant execute on function public.platform_admin_get_company_detail(uuid) to authenticated;

-- ============================================================================
-- 6) Company members (memberships + roles) — reused by the company detail
--    page AND the Roles & Permissions page ("who holds this role").
-- ============================================================================
create or replace function public.platform_admin_list_company_members(target_company_id uuid)
returns table (
  membership_id uuid,
  user_id uuid,
  full_name text,
  email text,
  status public.membership_status,
  role_names text[],
  role_ids uuid[],
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator can list company members';
  end if;

  return query
  select cm.id, cm.user_id, p.full_name, u.email::text, cm.status,
    coalesce(array_agg(r.name order by r.name) filter (where r.name is not null), array[]::text[]),
    coalesce(array_agg(r.id) filter (where r.id is not null), array[]::uuid[]),
    cm.joined_at
  from public.company_memberships cm
  join public.profiles p on p.id = cm.user_id
  join auth.users u on u.id = cm.user_id
  left join public.membership_roles mr on mr.membership_id = cm.id
  left join public.roles r on r.id = mr.role_id
  where cm.company_id = target_company_id
  group by cm.id, cm.user_id, p.full_name, u.email, cm.status, cm.joined_at
  order by p.full_name asc
  limit 500;
end;
$$;

revoke all on function public.platform_admin_list_company_members(uuid) from public, anon;
grant execute on function public.platform_admin_list_company_members(uuid) to authenticated;

-- ============================================================================
-- 7) Company projects / employees rosters — bounded, company detail page.
-- ============================================================================
create or replace function public.platform_admin_list_company_projects(target_company_id uuid)
returns table (id uuid, name text, status public.project_status, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator can list company projects';
  end if;

  return query
  select pr.id, pr.name, pr.status, pr.created_at
  from public.projects pr
  where pr.company_id = target_company_id
  order by pr.created_at desc
  limit 300;
end;
$$;

revoke all on function public.platform_admin_list_company_projects(uuid) from public, anon;
grant execute on function public.platform_admin_list_company_projects(uuid) to authenticated;

create or replace function public.platform_admin_list_company_employees(target_company_id uuid)
returns table (
  id uuid,
  employee_number text,
  first_name text,
  last_name text,
  employment_status public.employment_status,
  account_status public.employee_account_status,
  position_title text,
  profile_id uuid
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator can list company employees';
  end if;

  return query
  select e.id, e.employee_number, e.first_name, e.last_name, e.employment_status, e.account_status, e.position_title, e.profile_id
  from public.employees e
  where e.company_id = target_company_id
  order by e.last_name asc, e.first_name asc
  limit 300;
end;
$$;

comment on function public.platform_admin_list_company_employees(uuid) is
  'Bounded to 300 rows — a company detail page listing, not a full-export path. A company with more than 300 employee records is directed to the company''s own Employees module (which already paginates) rather than this console growing an unbounded export here.';

revoke all on function public.platform_admin_list_company_employees(uuid) from public, anon;
grant execute on function public.platform_admin_list_company_employees(uuid) to authenticated;

-- ============================================================================
-- 8) Users page — search/filter (name, email, company, role, account
--    status), paginated.
-- ============================================================================
create or replace function public.platform_admin_list_accounts(
  search_query text default null,
  filter_account_status public.account_status default null,
  filter_company_id uuid default null,
  filter_role_name text default null,
  limit_count int default 25,
  offset_count int default 0
)
returns table (
  id uuid,
  full_name text,
  email text,
  account_status public.account_status,
  account_status_reason text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator can list accounts';
  end if;

  return query
  select p.id, p.full_name, u.email::text, p.account_status, p.account_status_reason, p.created_at,
    count(*) over() as total_count
  from public.profiles p
  join auth.users u on u.id = p.id
  where (search_query is null or btrim(search_query) = '' or p.full_name ilike '%' || search_query || '%' or u.email ilike '%' || search_query || '%')
    and (filter_account_status is null or p.account_status = filter_account_status)
    and (filter_company_id is null or exists (
      select 1 from public.company_memberships cm where cm.user_id = p.id and cm.company_id = filter_company_id and cm.status = 'active'
    ))
    and (filter_role_name is null or exists (
      select 1
      from public.company_memberships cm
      join public.membership_roles mr on mr.membership_id = cm.id
      join public.roles r on r.id = mr.role_id
      where cm.user_id = p.id and cm.status = 'active' and r.name = filter_role_name
        and (filter_company_id is null or cm.company_id = filter_company_id)
    ))
  order by p.created_at desc
  limit least(coalesce(limit_count, 25), 100) offset greatest(coalesce(offset_count, 0), 0);
end;
$$;

comment on function public.platform_admin_list_accounts(text, public.account_status, uuid, text, int, int) is
  'Part 2 Users page — supersedes platform_admin_search_accounts(text, int) for the paginated/filterable list (that function is left in place, still used by the Create Company wizard''s lightweight "existing account" search). total_count via window function for pagination.';

revoke all on function public.platform_admin_list_accounts(text, public.account_status, uuid, text, int, int) from public, anon;
grant execute on function public.platform_admin_list_accounts(text, public.account_status, uuid, text, int, int) to authenticated;

-- ============================================================================
-- 9) Security page — platform-wide security_events, paginated.
-- ============================================================================
create or replace function public.platform_admin_list_security_events(limit_count int default 50, offset_count int default 0)
returns table (
  id uuid,
  user_id uuid,
  user_full_name text,
  event_type public.security_event_type,
  actor_user_id uuid,
  actor_full_name text,
  ip_address inet,
  user_agent text,
  detail text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator can view platform-wide security history';
  end if;

  return query
  select se.id, se.user_id, up.full_name, se.event_type, se.actor_user_id, ap.full_name, se.ip_address, se.user_agent, se.detail, se.created_at,
    count(*) over() as total_count
  from public.security_events se
  left join public.profiles up on up.id = se.user_id
  left join public.profiles ap on ap.id = se.actor_user_id
  order by se.created_at desc
  limit least(coalesce(limit_count, 50), 200) offset greatest(coalesce(offset_count, 0), 0);
end;
$$;

revoke all on function public.platform_admin_list_security_events(int, int) from public, anon;
grant execute on function public.platform_admin_list_security_events(int, int) to authenticated;

-- ============================================================================
-- 10) Audit Log page — full audit_events browser, filterable + paginated.
--     (Direct table SELECT now also works for a platform admin per fix
--     §0 above; this RPC exists for the same reason platform_admin_list_
--     accounts exists rather than a raw client select — typed filters +
--     total_count in one round trip, and a hard LIMIT ceiling that a raw
--     client query relies on the caller to remember to set.)
-- ============================================================================
create or replace function public.platform_admin_list_audit_events(
  filter_actor_user_id uuid default null,
  filter_action public.audit_action default null,
  filter_entity_type text default null,
  filter_company_id uuid default null,
  filter_date_from timestamptz default null,
  filter_date_to timestamptz default null,
  limit_count int default 50,
  offset_count int default 0
)
returns table (
  id uuid,
  company_id uuid,
  company_name text,
  actor_user_id uuid,
  actor_full_name text,
  action public.audit_action,
  entity_type text,
  entity_id uuid,
  changes jsonb,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator can browse the platform-wide audit log';
  end if;

  return query
  select ae.id, ae.company_id, c.name, ae.actor_user_id, p.full_name, ae.action, ae.entity_type, ae.entity_id, ae.changes, ae.created_at,
    count(*) over() as total_count
  from public.audit_events ae
  left join public.companies c on c.id = ae.company_id
  left join public.profiles p on p.id = ae.actor_user_id
  where (filter_actor_user_id is null or ae.actor_user_id = filter_actor_user_id)
    and (filter_action is null or ae.action = filter_action)
    and (filter_entity_type is null or ae.entity_type = filter_entity_type)
    and (filter_company_id is null or ae.company_id = filter_company_id)
    and (filter_date_from is null or ae.created_at >= filter_date_from)
    and (filter_date_to is null or ae.created_at <= filter_date_to)
  order by ae.created_at desc
  limit least(coalesce(limit_count, 50), 200) offset greatest(coalesce(offset_count, 0), 0);
end;
$$;

revoke all on function public.platform_admin_list_audit_events(uuid, public.audit_action, text, uuid, timestamptz, timestamptz, int, int) from public, anon;
grant execute on function public.platform_admin_list_audit_events(uuid, public.audit_action, text, uuid, timestamptz, timestamptz, int, int) to authenticated;

-- ============================================================================
-- 11) Platform super admin roster — Platform Settings page ("who currently
--     holds this access"). grant_platform_super_admin()/
--     revoke_platform_super_admin() already exist (20260819095000); this
--     is the missing read side.
-- ============================================================================
create or replace function public.platform_admin_list_super_admins()
returns table (user_id uuid, full_name text, email text, granted_at timestamptz, granted_by uuid, granted_by_name text, notes text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_super_admin() then
    raise exception 'only a platform super administrator can view the platform administrator roster';
  end if;

  return query
  select psa.user_id, p.full_name, u.email::text, psa.granted_at, psa.granted_by, gp.full_name, psa.notes
  from public.platform_super_admins psa
  join public.profiles p on p.id = psa.user_id
  join auth.users u on u.id = psa.user_id
  left join public.profiles gp on gp.id = psa.granted_by
  order by psa.granted_at asc
  limit 200;
end;
$$;

revoke all on function public.platform_admin_list_super_admins() from public, anon;
grant execute on function public.platform_admin_list_super_admins() to authenticated;
