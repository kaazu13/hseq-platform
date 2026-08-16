-- ============================================================================
-- Completion pass, Part 1: correct is_scaffold_broad_creator() to match the
-- exact product rule (which is narrower than the original V2 migration's
-- reading of "existing authorization permits").
--
-- The prior version (20260831093000_scaffold_register_v2.sql) included
-- hse_officer, inspector (project-scoped), and hseq_manager (company-wide)
-- as broad creators, reasoning from "they already have HSEQ-record-
-- creation rights elsewhere (inspections, LMRA)". The corrected product
-- rule is explicit that this inference is wrong: being trusted to VIEW the
-- register, or to create OTHER HSEQ records, does not imply scaffold-
-- REGISTRATION authority. The corrected set:
--
--   - hseq_manager:    VIEW only (was: broad creator) — no exception
--                       authorized for scaffold creation specifically.
--   - hse_officer:     VIEW only (was: broad creator, project-scoped).
--   - inspector:       VIEW only (was: broad creator, project-scoped) —
--                       Scaffold INSPECTION creation is untouched, see
--                       is_scaffold_manage_tier()/scaffold_inspections
--                       RLS, which this migration does not modify.
--   - foreman:         unchanged — self-only creation via
--                       is_caller_eligible_scaffold_foreman(), untouched.
--   - project_manager: unchanged — the project's own PM, via
--                       is_project_manager() (a real assignment_role=
--                       'project_manager' row, not a looser "any
--                       assignment" check).
--   - company_admin:   unchanged — inspected against
--                       docs/ROLES_AND_PERMISSIONS.md's own seeded
--                       description ("Highest authority inside their
--                       company... full visibility across all projects and
--                       modules") and confirmed as the genuine company-
--                       level operational-management role.
--   - operations_manager: inspected and confirmed EXCLUDED — its own
--                       seeded description scopes it to "normal employee
--                       administration... coordinates project staffing"
--                       and explicitly forbids it from gaining elevated/
--                       specialist authority. Was already excluded pre-
--                       and post-V2; unchanged.
--   - platform_super_admin: NEW — added directly here so the rule is
--                       enforced at the one real authorization chokepoint
--                       (RLS) regardless of caller (UI, direct RPC, or a
--                       future console feature). See
--                       modules/scaffolds/permissions.ts's updated
--                       canCreateScaffold()/isScaffoldBroadCreator()
--                       comment for why no matching page-level bypass was
--                       added — requireCompanyMembership() still gates
--                       every page first, and broadening THAT shared
--                       chokepoint for every module is out of scope here.
-- ============================================================================
create or replace function public.is_scaffold_broad_creator(target_company_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    public.is_platform_super_admin()
    or public.has_company_role(target_company_id, 'company_admin')
    or public.is_project_manager(target_project_id);
$$;

comment on function public.is_scaffold_broad_creator(uuid, uuid) is
  'Every scaffold-creation path EXCEPT "a Foreman registering with themselves as Responsible Foreman" (see is_caller_eligible_scaffold_foreman). Corrected (completion pass, Part 1) to the exact product rule: company_admin (the genuine company-level HSEQ-authority role) + the project''s own project_manager + platform_super_admin (global). hse_officer/inspector/hseq_manager/operations_manager are VIEW-tier only for the register — being trusted with other HSEQ records, or with viewing, does not imply scaffold-registration authority.';
