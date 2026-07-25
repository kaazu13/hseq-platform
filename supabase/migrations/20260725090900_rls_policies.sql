-- Row Level Security: enable + force RLS, base grants, and policies for
-- every table created in this milestone.
--
-- Two layers are both required for a table to be usable from the app:
--   1. A GRANT to `authenticated` — current Supabase projects do NOT
--      auto-expose newly created tables to the Data API roles (see the
--      `auto_expose_new_tables` note in supabase/config.toml); without an
--      explicit GRANT, every query is rejected before RLS is even
--      evaluated, regardless of policies.
--   2. RLS policies — govern WHICH rows are visible/writable once the
--      GRANT allows the operation at all.
-- Nothing is ever granted to `anon` — every table here requires a session.
--
-- No policy in this file uses `USING (true)`. Where a table looks
-- "openly" readable (roles), that's a deliberate, justified exception —
-- see the comment on that policy, not an oversight.

-- ── organizations ─────────────────────────────────────────────────────
alter table public.organizations enable row level security;
alter table public.organizations force row level security;

grant select on public.organizations to authenticated;

create policy organizations_select_active_member
  on public.organizations
  for select
  to authenticated
  using (public.is_organization_member(id));

-- Deferred: no INSERT/UPDATE/DELETE policy for `authenticated` yet.
-- Organization creation is a manual, service-role operation for v1 (see
-- supabase/seed.sql and docs/PRODUCT_REQUIREMENTS.md — no self-service org
-- registration). Org-settings UI (Company Admin editing name/settings) is
-- explicitly out of scope for this milestone (see the task's item 8).

-- ── profiles ──────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

grant select, update on public.profiles to authenticated;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No INSERT policy — rows are created exclusively by the
-- handle_new_user() trigger (SECURITY DEFINER, bypasses RLS). No DELETE
-- policy — identity persists; see docs/ARCHITECTURE.md §9.
--
-- Deferred: co-member profile visibility (e.g. rendering "Assigned to:
-- Jane Doe" for a colleague) is not implemented in this milestone — only
-- "read your own profile" was in scope. Revisit when a module first needs
-- to display another member's name.

-- ── organization_memberships ─────────────────────────────────────────
alter table public.organization_memberships enable row level security;
alter table public.organization_memberships force row level security;

grant select on public.organization_memberships to authenticated;

create policy organization_memberships_select_own_or_active_member
  on public.organization_memberships
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_organization_member(organization_id)
  );

-- `user_id = auth.uid()` lets a user see their OWN membership rows in any
-- status (including invited/suspended) across every organization they
-- have ever been linked to — required for a future organization switcher,
-- per docs/ARCHITECTURE.md §3.2. `is_organization_member(organization_id)`
-- additionally lets an ACTIVE member see the full membership roster of
-- that organization, per this milestone's explicit RLS requirement ("users
-- can read memberships ... within their active organization memberships").
--
-- Deferred: no INSERT/UPDATE/DELETE policy for `authenticated` yet —
-- invite/suspend/remove flows are not built in this milestone (item 8).

-- ── roles ─────────────────────────────────────────────────────────────
alter table public.roles enable row level security;
alter table public.roles force row level security;

grant select on public.roles to authenticated;

create policy roles_select_all
  on public.roles
  for select
  to authenticated
  using (auth.uid() is not null);

-- Deliberately open (to any signed-in user) rather than membership-scoped:
-- `roles` is a GLOBAL reference table (no organization_id at all — see
-- 20260725090400_roles.sql), holding nothing but the same fixed ten
-- role names/descriptions every organization already knows about. There is
-- no tenant boundary to cross here. The condition is still an explicit
-- session check, not a bare `USING (true)` — kept that way even though
-- `to authenticated` alone already implies auth.uid() is not null, so
-- there's no literal always-true policy anywhere in this migration.
--
-- No INSERT/UPDATE/DELETE policy — the catalogue is seeded once via
-- supabase/seed.sql and is not application-writable.

-- ── membership_roles ──────────────────────────────────────────────────
alter table public.membership_roles enable row level security;
alter table public.membership_roles force row level security;

grant select on public.membership_roles to authenticated;

create policy membership_roles_select_own_or_active_member
  on public.membership_roles
  for select
  to authenticated
  using (
    public.is_organization_member(organization_id)
    or exists (
      select 1
      from public.organization_memberships m
      where m.id = membership_roles.membership_id
        and m.user_id = auth.uid()
    )
  );

-- Same shape as organization_memberships' policy, for the same reason:
-- see your own role assignments regardless of your membership's status,
-- and see everyone's role assignments once you're an active member.
--
-- Deferred: no INSERT/UPDATE/DELETE policy for `authenticated` yet — role
-- assignment management is not built in this milestone (item 8).

-- ── audit_events ──────────────────────────────────────────────────────
alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;

-- Note: SELECT/INSERT only — no UPDATE/DELETE grant to `authenticated` at
-- all, on top of the "no such policy" below and the hard trigger in
-- 20260725090700_functions_and_triggers.sql. Three independent layers.
grant select, insert on public.audit_events to authenticated;

create policy audit_events_select_authorized_members
  on public.audit_events
  for select
  to authenticated
  using (
    organization_id is not null
    and (
      public.has_organization_role(organization_id, 'company_admin')
      or public.has_organization_role(organization_id, 'hseq_manager')
    )
  );

-- Matches the Audit Logs row of docs/ROLES_AND_PERMISSIONS.md §5 exactly:
-- Company Admin and HSEQ Manager can view their organization's audit
-- trail; every other role (including, deliberately, an organization's own
-- Operations Manager or Supervisor) cannot. Platform-Super-Admin-level
-- visibility into platform-scoped events (organization_id is null) is not
-- implemented in this milestone — there is no platform_super_admins table
-- yet (see the implementation report).

create policy audit_events_insert_self_attributed
  on public.audit_events
  for insert
  to authenticated
  with check (
    actor_user_id = auth.uid()
    and public.is_organization_member(organization_id)
  );

-- Lets a future Server Function write an audit row AS the acting user
-- (matching docs/API_CONVENTIONS.md's server-side mutation pattern)
-- without being able to forge another user's actor_user_id or write into
-- an organization they don't belong to. No business module in this
-- milestone actually exercises this path yet — it is here so the table is
-- usable the moment one does, without a follow-up migration.
--
-- No UPDATE/DELETE policy at all, for any role — see the header comment.
