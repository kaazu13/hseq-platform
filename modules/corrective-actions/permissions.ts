import type { RoleName } from "@/modules/companies/types";

/**
 * Corrective Actions role gates — mirror the RLS and
 * `can_close_corrective_action()`/`validate_corrective_action_update()` in
 * supabase/migrations/20260802120000_safety_observations_and_corrective_actions.sql
 * exactly (the database is the real enforcement; these functions only
 * decide what to render — see docs/API_CONVENTIONS.md §6).
 *
 * docs/ROLES_AND_PERMISSIONS.md §5's Corrective Actions row:
 * — | V | V | M⁴ | F | M⁴¹⁰ | M⁴¹⁰ | M⁴¹⁰ | — | — | O¹¹. HSE Manager is
 * unrestricted company-wide ("F"). Project Manager gets a clean, unrestricted-
 * within-project "M⁴" (footnote 10 doesn't apply to PM). HSE Officer/
 * Foreman/Inspector get "M⁴" WITH footnote 10's carve-out: can create/
 * manage actions raised from their own findings and progress an action
 * assigned to them, but cannot close/reject someone else's without HSE
 * Manager or PM sign-off. Employee gets "O¹¹": progress-only on an action
 * assigned to them, never due_date/priority/description, never close.
 */

const MANAGE_TIER_ROLES: RoleName[] = ["hse_officer", "foreman", "inspector"];

/** Can create a corrective action for a specific project. */
export function canCreateCorrectiveAction(roleNames: RoleName[], isProjectManager: boolean, hasProjectAccess: boolean): boolean {
  return (
    roleNames.includes("hseq_manager") ||
    (isProjectManager && hasProjectAccess) ||
    (hasProjectAccess && roleNames.some((role) => MANAGE_TIER_ROLES.includes(role)))
  );
}

/** Can edit due_date/priority/description/responsible_person — the manage-tier fields validate_corrective_action_update() locks to this same role set. */
export function canManageCorrectiveActionDetails(roleNames: RoleName[], isProjectManager: boolean, hasProjectAccess: boolean): boolean {
  return canCreateCorrectiveAction(roleNames, isProjectManager, hasProjectAccess);
}

/** Can advance status open → in_progress → awaiting_verification and set completion notes. `isAssignee` = responsible_person_id resolves to the caller. */
export function canUpdateCorrectiveActionProgress(
  roleNames: RoleName[],
  isProjectManager: boolean,
  hasProjectAccess: boolean,
  isAssignee: boolean,
): boolean {
  return canManageCorrectiveActionDetails(roleNames, isProjectManager, hasProjectAccess) || isAssignee;
}

/**
 * Can close/reject an awaiting_verification action, or reopen a closed/
 * rejected one — mirrors can_close_corrective_action() in the migration
 * exactly. `isOwnEntry` = the caller authored it (created_by) OR is its
 * responsible_person — footnote 10's "actions assigned to others" carve-out
 * for HSE Officer/Foreman/Inspector.
 */
export function canCloseCorrectiveAction(roleNames: RoleName[], isProjectManager: boolean, isOwnEntry: boolean): boolean {
  return roleNames.includes("hseq_manager") || isProjectManager || (isOwnEntry && roleNames.some((role) => MANAGE_TIER_ROLES.includes(role)));
}
