import type { RoleName } from "@/modules/organizations/types";

/**
 * Scaffolds/Scaffold Inspections role gates — mirror the RLS/
 * `is_scaffold_manage_tier()` in
 * supabase/migrations/20260803120000_scaffold_inspections.sql exactly
 * (the database is the real enforcement; these functions only decide
 * what to render — see docs/API_CONVENTIONS.md §6).
 *
 * docs/ROLES_AND_PERMISSIONS.md §5's Scaffold Inspections row:
 * — | V | V | V⁴ | F | M⁴ | V⁴ | M⁴ | — | — | V⁴
 * (PSA|CM|WC|PM|HM|HO|FM|IN|RC|PL|EM). HSE Manager is unrestricted
 * org-wide ("F"). HSE Officer AND Inspector both get "M⁴" (project-scoped
 * manage — create/edit/finalize). Foreman is "V⁴" here — VIEW ONLY, a
 * genuine departure from LMRA (Foreman "M⁴") and Safety Observations
 * (Foreman can create/edit their own) — scaffold inspection is a
 * specialist-inspector function in this schema, not a foreman one.
 * Project Manager and Employee are also "V⁴".
 */

const MANAGE_TIER_ROLES: RoleName[] = ["hse_officer", "inspector"];

/** Can create/edit a scaffold, create/edit/finalize an inspection, or edit its checklist. `hasProjectAccess` is the caller's own has_project_access(project_id). */
export function canManageScaffold(roleNames: RoleName[], hasProjectAccess: boolean): boolean {
  return roleNames.includes("hseq_manager") || (hasProjectAccess && roleNames.some((role) => MANAGE_TIER_ROLES.includes(role)));
}
