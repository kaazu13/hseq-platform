-- Development-only seed/bootstrap data.
--
-- Run automatically by `supabase db reset` / `supabase start` (see
-- supabase/config.toml → [db.seed]). Safe to re-run — every statement is
-- idempotent (on conflict do nothing/update). Contains no real emails,
-- passwords, or secrets — only fixed placeholder UUIDs and generic labels.
--
-- NEVER run this against a production project. It is meant for a local
-- (`supabase start`) or disposable dev Supabase project only.

-- ── 1) Standard role catalogue ───────────────────────────────────────
-- The fixed eleven roles from docs/ROLES_AND_PERMISSIONS.md §1, finalized
-- by the Role Catalogue & Permissions milestone
-- (supabase/migrations/20260726120000_role_catalogue_update.sql) —
-- `supervisor`/`payroll_admin` retired, `foreman`/`hse_officer`/
-- `recruiter` added. Every environment (dev, staging, production) needs
-- this exact seed — it is not development-only data, but is included
-- here so a fresh local database is immediately usable. If a staging/
-- production environment is bootstrapped without running this whole
-- file, apply just this block. `name` is the stable machine key
-- (authorization logic); `display_label` is the human-facing name only.

insert into public.roles (name, description, display_label, is_system) values
  ('platform_super_admin', 'Vendor operator. Onboards/suspends organizations; independent of organization_memberships.', 'Platform Super Admin', true),
  ('company_admin', 'Highest authority inside their organization. Manages employees/memberships/roles, org settings; full visibility across the org.', 'Company Manager', true),
  ('operations_manager', 'Manages normal employee administration and availability; coordinates project staffing. Never assigns or removes elevated organization roles.', 'Workforce Coordinator', true),
  ('project_manager', 'Manages a specific project: schedule, budget-adjacent data, HSEQ status for that project. Project-scoped once the Projects module exists.', 'Project Manager', true),
  ('hseq_manager', 'Owns HSEQ modules — organization-wide or assigned-project scope depending on configuration. No general organization role management unless separately assigned Company Manager.', 'HSE Manager', true),
  ('hse_officer', 'Assigned-project operational HSEQ role, kept separate from Inspector. Only sees assigned projects unless explicitly granted broader HSE scope.', 'HSE Officer', true),
  ('foreman', 'Assigned-project/team frontline operational leadership. Manages the specific teams they are assigned to within a project; cannot issue final company-level disciplinary actions independently.', 'Foreman', true),
  ('inspector', 'Conducts formal inspections (scaffold, safety walks) and raises corrective actions.', 'Inspector', true),
  ('recruiter', 'Future Talent Pool and recruitment access. May see open-to-work employees and qualification validity once built. Cannot manage organization roles and does not see private disciplinary details or full audit history.', 'Recruiter', true),
  ('planner', 'Builds and maintains the daily workforce schedule.', 'Planner', true),
  ('employee', 'Field worker. Views own schedule/documents, submits own timesheet, completes assigned HSEQ forms.', 'Employee', true)
on conflict (name) do update set
  description = excluded.description,
  display_label = excluded.display_label,
  is_system = excluded.is_system;

-- ── 2) One example organization ──────────────────────────────────────
-- Fixed, well-known UUID (not a secret — just a stable id so the
-- instructions below can reference it directly without a lookup step).

insert into public.organizations (id, name, slug, status)
values (
  '00000000-0000-0000-0000-000000000001',
  'Example Construction Co',
  'example-construction-co',
  'trial'
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug;

-- ── 3) Attaching a real auth user to the example organization ───────
-- This part is intentionally NOT auto-executed: it needs a real
-- auth.users.id, which only exists after someone actually signs up (the
-- public.profiles row is then created automatically by the
-- handle_new_user() trigger — see
-- supabase/migrations/20260725090700_functions_and_triggers.sql).
--
-- Steps:
--
--   1. Create a user, either:
--      a) through the app's own /login flow's sign-up path once one
--         exists, or
--      b) locally: `supabase start`, then open Studio (the URL it
--         prints) → Authentication → Users → Add user, or
--         `supabase auth users create <email> --password <password>`
--         (use a throw-away local address/password — never a real one).
--
--   2. Copy that user's UUID from Studio (or the CLI output) and
--      substitute it for <AUTH_USER_UUID> below, then run this block
--      (e.g. `supabase db execute -f -` or paste into Studio's SQL editor).
--      It is written to be safely re-run.
--
-- begin;
--
--   insert into public.organization_memberships
--       (organization_id, user_id, status, joined_at)
--   values (
--     '00000000-0000-0000-0000-000000000001',
--     '<AUTH_USER_UUID>',
--     'active',
--     now()
--   )
--   on conflict (organization_id, user_id) do update set
--     status = 'active',
--     joined_at = coalesce(public.organization_memberships.joined_at, now());
--
--   insert into public.membership_roles (organization_id, membership_id, role_id)
--   select
--     '00000000-0000-0000-0000-000000000001',
--     m.id,
--     r.id
--   from public.organization_memberships m
--   join public.roles r on r.name = 'company_admin'
--   where m.organization_id = '00000000-0000-0000-0000-000000000001'
--     and m.user_id = '<AUTH_USER_UUID>'
--   on conflict (membership_id, role_id) do nothing;
--
--   update public.profiles
--   set active_organization_id = '00000000-0000-0000-0000-000000000001'
--   where id = '<AUTH_USER_UUID>';
--
-- commit;
