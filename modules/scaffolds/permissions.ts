import type { RoleName } from "@/modules/companies/types";

/**
 * Scaffolds/Scaffold Inspections role gates — mirror the RLS/
 * `is_scaffold_manage_tier()` in
 * supabase/migrations/20260803120000_scaffold_inspections.sql exactly
 * (the database is the real enforcement; these functions only decide
 * what to render — see docs/API_CONVENTIONS.md §6).
 *
 * docs/ROLES_AND_PERMISSIONS.md §5's Scaffold Inspections row (unchanged
 * by Scaffold Register V2, Part 4 of the post-audit implementation
 * package — only SCAFFOLD CREATION rights changed, see canCreateScaffold
 * below; scaffold EDIT and scaffold INSPECTIONS both still use
 * canManageScaffold exactly as before):
 * — | V | V | V⁴ | F | M⁴ | V⁴ | M⁴ | — | — | V⁴
 * (PSA|CM|WC|PM|HM|HO|FM|IN|RC|PL|EM). HSE Manager is unrestricted
 * company-wide ("F"). HSE Officer AND Inspector both get "M⁴" (project-scoped
 * manage — create/edit/finalize). Foreman is "V⁴" here — VIEW ONLY for
 * EDITING/INSPECTIONS, a genuine departure from LMRA (Foreman "M⁴") and
 * Safety Observations (Foreman can create/edit their own) — scaffold
 * inspection is a specialist-inspector function in this schema, not a
 * foreman one. Project Manager and Employee are also "V⁴" for edit/inspect.
 */

const MANAGE_TIER_ROLES: RoleName[] = ["hse_officer", "inspector"];

/** Can EDIT a scaffold, or create/edit/finalize a scaffold inspection/its checklist. `hasProjectAccess` is the caller's own has_project_access(project_id). Deliberately unchanged by V2 — see this file's header comment. */
export function canManageScaffold(roleNames: RoleName[], hasProjectAccess: boolean): boolean {
  return roleNames.includes("hseq_manager") || (hasProjectAccess && roleNames.some((role) => MANAGE_TIER_ROLES.includes(role)));
}

/**
 * V2: who may VIEW the Scaffold Register at all. Previously role-agnostic
 * (any project-assigned person, including a plain Employee, via
 * has_project_access alone) — now an explicit non-employee operational-
 * role allow-list, mirroring the migration's rewritten scaffolds_select
 * RLS policy exactly. Employees never see this module, full stop.
 */
const VIEW_TIER_PROJECT_ROLES: RoleName[] = ["project_manager", "hse_officer", "foreman", "inspector"];
const VIEW_TIER_COMPANY_WIDE_ROLES: RoleName[] = ["company_admin", "operations_manager", "hseq_manager"];

export function canViewScaffoldRegister(roleNames: RoleName[], hasProjectAccess: boolean): boolean {
  return roleNames.some((role) => VIEW_TIER_COMPANY_WIDE_ROLES.includes(role)) || (hasProjectAccess && roleNames.some((role) => VIEW_TIER_PROJECT_ROLES.includes(role)));
}

/**
 * V2: who may CREATE/REGISTER a scaffold — broader than canManageScaffold.
 * Mirrors is_scaffold_broad_creator() (SQL) exactly for the "broad" path;
 * `isEligibleForeman` is the caller's own is_caller_eligible_scaffold_foreman()
 * result — a Foreman with no other qualifying role can ALSO create, but
 * ONLY with themselves as Responsible Foreman (enforced server-side by
 * validate_scaffold_insert(), never merely by this UI-gating function or a
 * disabled field). operations_manager is deliberately excluded — every
 * other HSEQ-record-creation surface in this schema (LMRA, Observations,
 * Corrective Actions) consistently excludes it too.
 */
const BROAD_CREATOR_PROJECT_ROLES: RoleName[] = ["hse_officer", "inspector", "project_manager"];
const BROAD_CREATOR_COMPANY_WIDE_ROLES: RoleName[] = ["hseq_manager", "company_admin"];

export function isScaffoldBroadCreator(roleNames: RoleName[], hasProjectAccess: boolean): boolean {
  return roleNames.some((role) => BROAD_CREATOR_COMPANY_WIDE_ROLES.includes(role)) || (hasProjectAccess && roleNames.some((role) => BROAD_CREATOR_PROJECT_ROLES.includes(role)));
}

export function canCreateScaffold(roleNames: RoleName[], hasProjectAccess: boolean, isEligibleForeman: boolean): boolean {
  return isScaffoldBroadCreator(roleNames, hasProjectAccess) || isEligibleForeman;
}

/** True if the caller's ONLY basis for creating is being an eligible Foreman themselves — the UI uses this to lock the Responsible Foreman field to their own name and hide/restrict the Foreman-of-choice picker, mirroring the server-side self-lock exactly (never the sole enforcement — see validate_scaffold_insert()). */
export function mustSelfLockResponsibleForeman(roleNames: RoleName[], hasProjectAccess: boolean, isEligibleForeman: boolean): boolean {
  return isEligibleForeman && !isScaffoldBroadCreator(roleNames, hasProjectAccess);
}
