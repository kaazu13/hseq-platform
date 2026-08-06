import type { RoleName } from "@/modules/companies/types";

/**
 * Scaffold Defects role gates — mirror the RLS and
 * `can_close_scaffold_defect()`/`is_scaffold_manage_tier()`/
 * `validate_scaffold_defect_update()` in
 * supabase/migrations/20260803120000_scaffold_inspections.sql exactly.
 * Deliberately narrower than modules/corrective-actions/permissions.ts —
 * no Project-Manager unrestricted-within-project branch, since PM is
 * View-only ("V⁴") for the whole Scaffold Inspections module (unlike
 * Corrective Actions, where PM holds a clean "M⁴").
 */

const MANAGE_TIER_ROLES: RoleName[] = ["hse_officer", "inspector"];

/** Can create a defect, or edit its description/severity/due date/responsible person. */
export function canManageScaffoldDefectDetails(roleNames: RoleName[], hasProjectAccess: boolean): boolean {
  return roleNames.includes("hseq_manager") || (hasProjectAccess && roleNames.some((role) => MANAGE_TIER_ROLES.includes(role)));
}

/** Can advance status open → in_progress → awaiting_verification and set completion notes. `isAssignee` = responsible_person_id resolves to the caller. */
export function canUpdateScaffoldDefectProgress(roleNames: RoleName[], hasProjectAccess: boolean, isAssignee: boolean): boolean {
  return canManageScaffoldDefectDetails(roleNames, hasProjectAccess) || isAssignee;
}

/** Can close/reject an awaiting_verification defect, or reopen a closed/rejected one — mirrors can_close_scaffold_defect() exactly. `isOwnEntry` = the caller authored it (created_by) OR is its responsible_person. */
export function canCloseScaffoldDefect(roleNames: RoleName[], hasProjectAccess: boolean, isOwnEntry: boolean): boolean {
  return roleNames.includes("hseq_manager") || (hasProjectAccess && isOwnEntry && roleNames.some((role) => MANAGE_TIER_ROLES.includes(role)));
}
