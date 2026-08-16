-- Second Employee-role correction pass, Part 7 — optional equipment/PPE
-- validity (expiry) tracking, plus Part 9's platform_super_admin global
-- equipment authority.
--
-- Design (mirrors this milestone's explicit requirements):
--
-- 1. `equipment_items.default_validity_days` — an OPTIONAL default validity
--    period for an item type (e.g. a harness = 365 days). Null means "no
--    default expiry" — most items (a drill, a radio) never need one.
--
-- 2. `equipment_assignments.expires_at` — the EFFECTIVE expiration for ONE
--    specific issuance, resolved and FROZEN at issue time (from the item's
--    default_validity_days, or an explicit override — see
--    20260901101000_equipment_validity_rpcs.sql's updated issue_equipment()).
--    Critical, explicitly required invariant: once issued, this value is
--    never recalculated from the item's CURRENT default — changing an
--    item's default_validity_days later must not silently rewrite
--    already-issued assignments' expiry. A plain frozen column (not a
--    generated/computed one) is what guarantees this.
--
-- 3. Adjusting an already-issued assignment's expiry later (accept
--    default / override / remove / re-adjust with a reason) is a new RPC,
--    update_equipment_assignment_expiry() — see the next migration file
--    (its use of the new equipment_history 'expiry_updated' event value
--    added below can't be referenced in THIS same transaction; see
--    20260727090000_employment_periods.sql's header for why).
--
-- 4. RLS already restricts equipment_assignments UPDATE to
--    is_equipment_manage_tier() only (no "or the assignee themselves"
--    branch exists) — so "no employee self-edit of their own equipment's
--    expiry" (Part 18) already holds by construction once expires_at lives
--    on this same table; nothing further to lock down there.
--
-- 5. Part 9: platform_super_admin currently has NO special standing over
--    equipment at all (is_equipment_manage_tier only checks company roles
--    + project_manager; is_company_member has no platform-admin bypass,
--    unlike the Platform Admin Console's OWN dedicated global RPCs, which
--    deliberately never touch per-table RLS). Genuine "global authority"
--    over equipment specifically (not just a separate read-only console)
--    needs is_platform_super_admin() woven into is_equipment_manage_tier
--    AND the SELECT policies — additive only, mirrors the exact
--    `is_platform_super_admin() or has_any_company_role(...)` precedent
--    already used in 20260829090000_onboarding.sql.

-- ============================================================================
-- 1) equipment_items.default_validity_days
-- ============================================================================
alter table public.equipment_items
  add column default_validity_days integer;

alter table public.equipment_items
  add constraint equipment_items_default_validity_bounds
  check (default_validity_days is null or (default_validity_days > 0 and default_validity_days <= 36500));

comment on column public.equipment_items.default_validity_days is
  'Optional default validity period in days for a NEW issuance of this item (e.g. 365 for an annually-rated harness). Null = no default expiry. Changing this NEVER retroactively changes already-issued assignments'' equipment_assignments.expires_at — see that column''s comment.';

-- ============================================================================
-- 2) equipment_assignments.expires_at
-- ============================================================================
alter table public.equipment_assignments
  add column expires_at date;

alter table public.equipment_assignments
  add constraint equipment_assignments_expires_at_not_before_issued
  check (expires_at is null or expires_at >= issued_at);

alter table public.equipment_assignments
  add constraint equipment_assignments_expires_at_sane_bound
  check (expires_at is null or (expires_at - issued_at) <= 36500);

comment on column public.equipment_assignments.expires_at is
  'This ONE issuance''s effective expiry, resolved and frozen at issue time (equipment_items.default_validity_days applied then, or an explicit override) — never dynamically recalculated from the item''s current default. Adjustable later only via update_equipment_assignment_expiry() (audited, reason required), never a raw UPDATE from the client.';

create index equipment_assignments_expires_at_idx on public.equipment_assignments (expires_at) where status = 'active' and expires_at is not null;

-- ============================================================================
-- 3) equipment_history — new 'expiry_updated' event value (used starting
--    in the NEXT migration file — see this file's header).
-- ============================================================================
alter type public.equipment_history_event add value 'expiry_updated';

-- ============================================================================
-- 4) Platform Super Admin global equipment authority (Part 9)
-- ============================================================================
create or replace function public.is_equipment_manage_tier(target_company_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    public.is_platform_super_admin()
    or public.has_any_company_role(target_company_id, array['company_admin', 'operations_manager'])
    or (target_project_id is not null and public.is_project_manager(target_project_id));
$$;

comment on function public.is_equipment_manage_tier(uuid, uuid) is
  'Equipment management authority — platform_super_admin (global, every company), company_admin/operations_manager (company-wide within their own company), or a project_manager for items already allocated to their OWN project. Foreman/HSE Officer/Inspector/etc. are never administrators here (Part 9) — they remain valid PPE recipients only.';

-- Every SELECT policy gated `is_company_member(company_id) and (...)`
-- needs is_platform_super_admin() as a SEPARATE top-level OR (not folded
-- inside the is_company_member branch) — a platform_super_admin generally
-- has no company_memberships row at all, so the "and" would still block
-- them without this.
drop policy if exists equipment_items_select on public.equipment_items;
create policy equipment_items_select
  on public.equipment_items
  for select
  to authenticated
  using (
    public.is_platform_super_admin()
    or (
      public.is_company_member(company_id)
      and (project_id is null or public.has_project_access(project_id) or public.is_equipment_manage_tier(company_id, project_id))
    )
  );

drop policy if exists equipment_assignments_select on public.equipment_assignments;
create policy equipment_assignments_select
  on public.equipment_assignments
  for select
  to authenticated
  using (
    public.is_platform_super_admin()
    or (
      public.is_company_member(company_id)
      and (
        exists (select 1 from public.equipment_items ei where ei.id = equipment_assignments.equipment_item_id and public.is_equipment_manage_tier(ei.company_id, ei.project_id))
        or exists (select 1 from public.employees e where e.id = equipment_assignments.employee_id and e.profile_id = auth.uid())
      )
    )
  );

drop policy if exists equipment_requests_select on public.equipment_requests;
create policy equipment_requests_select
  on public.equipment_requests
  for select
  to authenticated
  using (
    public.is_platform_super_admin()
    or (
      public.is_company_member(company_id)
      and (
        public.is_equipment_manage_tier(company_id, project_id)
        or exists (select 1 from public.employees e where e.id = equipment_requests.employee_id and e.profile_id = auth.uid())
      )
    )
  );

drop policy if exists equipment_history_select on public.equipment_history;
create policy equipment_history_select
  on public.equipment_history
  for select
  to authenticated
  using (
    public.is_platform_super_admin()
    or (
      public.is_company_member(company_id)
      and (
        exists (select 1 from public.equipment_items ei where ei.id = equipment_history.equipment_item_id and public.is_equipment_manage_tier(ei.company_id, ei.project_id))
        or (equipment_history.employee_id is not null and exists (select 1 from public.employees e where e.id = equipment_history.employee_id and e.profile_id = auth.uid()))
      )
    )
  );

-- Write-side policies also gated `is_company_member(company_id) and
-- is_equipment_manage_tier(...)` — is_equipment_manage_tier alone now
-- returns true for a platform_super_admin, but the surrounding "and
-- is_company_member" would still block a platform_super_admin who has no
-- membership row in that specific company, so it needs the same top-level
-- "or is_platform_super_admin()" treatment for genuine global WRITE
-- authority (issue/return/approve/deny/adjust expiry), not just read.
drop policy if exists equipment_items_insert on public.equipment_items;
create policy equipment_items_insert
  on public.equipment_items
  for insert
  to authenticated
  with check (public.is_platform_super_admin() or (public.is_company_member(company_id) and public.is_equipment_manage_tier(company_id, project_id)));

drop policy if exists equipment_items_update on public.equipment_items;
create policy equipment_items_update
  on public.equipment_items
  for update
  to authenticated
  using (public.is_platform_super_admin() or (public.is_company_member(company_id) and public.is_equipment_manage_tier(company_id, project_id)))
  with check (public.is_platform_super_admin() or (public.is_company_member(company_id) and public.is_equipment_manage_tier(company_id, project_id)));

drop policy if exists equipment_assignments_insert on public.equipment_assignments;
create policy equipment_assignments_insert
  on public.equipment_assignments
  for insert
  to authenticated
  with check (
    public.is_platform_super_admin()
    or (
      public.is_company_member(company_id)
      and exists (select 1 from public.equipment_items ei where ei.id = equipment_assignments.equipment_item_id and public.is_equipment_manage_tier(ei.company_id, ei.project_id))
    )
  );

drop policy if exists equipment_assignments_update on public.equipment_assignments;
create policy equipment_assignments_update
  on public.equipment_assignments
  for update
  to authenticated
  using (
    public.is_platform_super_admin()
    or (
      public.is_company_member(company_id)
      and exists (select 1 from public.equipment_items ei where ei.id = equipment_assignments.equipment_item_id and public.is_equipment_manage_tier(ei.company_id, ei.project_id))
    )
  )
  with check (
    public.is_platform_super_admin()
    or (
      public.is_company_member(company_id)
      and exists (select 1 from public.equipment_items ei where ei.id = equipment_assignments.equipment_item_id and public.is_equipment_manage_tier(ei.company_id, ei.project_id))
    )
  );

drop policy if exists equipment_requests_update on public.equipment_requests;
create policy equipment_requests_update
  on public.equipment_requests
  for update
  to authenticated
  using (
    public.is_platform_super_admin()
    or (
      public.is_company_member(company_id)
      and (
        public.is_equipment_manage_tier(company_id, project_id)
        or exists (select 1 from public.employees e where e.id = equipment_requests.employee_id and e.profile_id = auth.uid())
      )
    )
  )
  with check (
    public.is_platform_super_admin()
    or (
      public.is_company_member(company_id)
      and (
        public.is_equipment_manage_tier(company_id, project_id)
        or exists (select 1 from public.employees e where e.id = equipment_requests.employee_id and e.profile_id = auth.uid())
      )
    )
  );

drop policy if exists equipment_history_insert on public.equipment_history;
create policy equipment_history_insert
  on public.equipment_history
  for insert
  to authenticated
  with check (
    public.is_platform_super_admin()
    or (
      public.is_company_member(company_id)
      and exists (select 1 from public.equipment_items ei where ei.id = equipment_history.equipment_item_id and public.is_equipment_manage_tier(ei.company_id, ei.project_id))
    )
  );
