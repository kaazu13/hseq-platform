import type { RoleName } from "@/modules/companies/types";

/**
 * LMRA module role gates — mirror the RLS in
 * supabase/migrations/20260801090000_lmra.sql and
 * supabase/migrations/20260816090000_lmra_daily_workforce_redesign.sql
 * exactly (RLS is the real enforcement; these functions only decide what to
 * render — see docs/API_CONVENTIONS.md §6).
 *
 * Phase 1 of the redesign opened LMRA CREATION to any eligible project
 * worker, not only HSE Manager/Foreman — `canCreateLmra` reflects that.
 * `canManageLmra` (editing an EXISTING assessment) gained a third branch:
 * an ordinary worker may manage only their OWN assessment (`isOwnAssessment`,
 * resolved server-side from completed_by_employee_id — never a client-
 * trusted flag). HSE Manager/Foreman keep their original, unrestricted
 * "any assessment on this project" reach — this is strictly additive, never
 * a narrowing of what they could already do.
 */

/** Can create an LMRA for a specific project — HSE Manager (any project), the project's own Foreman, or any employee with active standing on the project (creating for themselves — see modules/lmra/actions.ts's requireLmraCreateAccess for how completed_by_employee_id is pinned to the caller, never client-supplied). */
export function canCreateLmra(roleNames: RoleName[], hasProjectAccess: boolean, isProjectForeman: boolean): boolean {
  return roleNames.includes("hseq_manager") || isProjectForeman || hasProjectAccess;
}

/**
 * Can edit/submit/review-approve an EXISTING LMRA. `isProjectForeman` is
 * the caller's OWN foreman standing on THIS project; `isOwnAssessment` is
 * whether the caller is the employee who completed THIS specific
 * assessment (both resolved server-side, same trust boundary as
 * modules/projects/permissions.ts's canManageProject).
 */
export function canManageLmra(roleNames: RoleName[], isProjectForeman: boolean, isOwnAssessment: boolean): boolean {
  return roleNames.includes("hseq_manager") || isProjectForeman || isOwnAssessment;
}

/** Archiving is HSE Manager only — Foreman's/an ordinary worker's "Manage" tier explicitly excludes it (docs/ROLES_AND_PERMISSIONS.md §3's F-vs-M legend). */
export function canArchiveLmra(roleNames: RoleName[]): boolean {
  return roleNames.includes("hseq_manager");
}
