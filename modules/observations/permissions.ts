import type { RoleName } from "@/modules/companies/types";

/**
 * Safety Observations role gates — mirror the RLS in
 * supabase/migrations/20260802120000_safety_observations_and_corrective_actions.sql
 * exactly (RLS is the real enforcement; these functions only decide what to
 * render — see docs/API_CONVENTIONS.md §6).
 *
 * docs/ROLES_AND_PERMISSIONS.md §5's Safety Observations row:
 * — | V | V | V⁴ | M | C⁴ | C⁴ | C⁴ | — | — | C¹². No role holds "F" here
 * — HSE Manager's "M" is the ceiling. Company Manager/Workforce
 * Coordinator/Project Manager are View-only. HSE Officer/Foreman/
 * Inspector/Employee (footnote 12) can all CREATE, but "C" only lets them
 * EDIT THEIR OWN entries — a genuine departure from LMRA, where a Foreman
 * manages every record on their assigned project, not just their own.
 * Reviewing and closing are both HSE-Manager-only ("approve" is in M's
 * definition, not C's).
 */

const CREATE_AND_OWN_EDIT_ROLES: RoleName[] = ["hse_officer", "foreman", "inspector", "employee"];

/**
 * Employee-role correction milestone: CREATE rights specifically no
 * longer include `employee` — reverses footnote 12's original "safety
 * reporting should never be gated behind a manager role" stance for this
 * one role, per an explicit new product direction (Employee's role here
 * is now "see observations about me," not "author observations"). Kept
 * as its own list, separate from `CREATE_AND_OWN_EDIT_ROLES` above
 * (still used by canEditObservation, unchanged) rather than removing
 * employee from that shared list — an employee can never produce a new
 * "own entry" to edit after this change anyway, so leaving edit's role
 * list alone is a no-op for them, not a widening.
 */
const CREATE_ROLES: RoleName[] = ["hse_officer", "foreman", "inspector"];

/** Can create an observation for a specific project. `hasProjectAccess` is the caller's own has_project_access(project_id) — the caller is responsible for scoping it to the right project, same trust boundary as modules/lmra/permissions.ts's canManageLmra. */
export function canCreateObservation(roleNames: RoleName[], hasProjectAccess: boolean): boolean {
  return roleNames.includes("hseq_manager") || (hasProjectAccess && roleNames.some((role) => CREATE_ROLES.includes(role)));
}

/** Can edit an existing observation's own fields (not review/close — see canReviewOrCloseObservation). `isOwnEntry` = the caller authored it (created_by = them). */
export function canEditObservation(roleNames: RoleName[], hasProjectAccess: boolean, isOwnEntry: boolean): boolean {
  if (roleNames.includes("hseq_manager")) return true;
  return isOwnEntry && hasProjectAccess && roleNames.some((role) => CREATE_AND_OWN_EDIT_ROLES.includes(role));
}

/** Reviewing (reviewed_at/reviewed_by) and closing are both HSE Manager only — the module's one "approve"-tier action, matching corrective actions' equally HSE-Manager-anchored close authority. */
export function canReviewOrCloseObservation(roleNames: RoleName[]): boolean {
  return roleNames.includes("hseq_manager");
}
