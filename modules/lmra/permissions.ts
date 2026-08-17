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

/**
 * Can make a REVIEW DECISION on an existing LMRA — approve/reject a
 * submitted assessment, or reopen an approved/rejected one back to draft.
 * Deliberately has NO `isOwnAssessment` branch: `canManageLmra`'s
 * own-assessment allowance exists for pre-submission self-editing (and
 * self-submit), never for reviewing/deciding on your own work — see
 * supabase/migrations/20260901107000_fix_lmra_review_self_approval.sql,
 * which closes the matching RLS/trigger-level gap so a direct table write
 * can't bypass this either. Reuses `canViewAllProjectLmra`'s existing
 * "sees more than just my own LMRA" role set (project foreman, hseq_manager,
 * company_admin, operations_manager, project_manager) plus hse_officer.
 * platform_super_admin is intentionally NOT included here — callers OR in
 * `isPlatformSuperAdmin()` separately, matching this module's established
 * pattern for that global, non-company-scoped authority.
 */
export function canReviewLmra(roleNames: RoleName[], isProjectForeman: boolean): boolean {
  return (
    isProjectForeman ||
    roleNames.includes("hseq_manager") ||
    roleNames.includes("hse_officer") ||
    roleNames.includes("company_admin") ||
    roleNames.includes("operations_manager") ||
    roleNames.includes("project_manager")
  );
}

/**
 * The "All LMRAs" list mode gate (Today's Teams/LMRA UX redesign, item 9).
 * RLS (`lmra_assessments_select`) already lets ANY project member read
 * every LMRA on a project they're assigned to — deliberately broader than
 * what this app chooses to SURFACE as a distinct "All LMRAs" tab, since an
 * ordinary employee's own operational need is "my own LMRAs," not a
 * project-wide list. This function mirrors the exact "company-level
 * authorized management" role set `app/(app)/lmra/new/page.tsx`'s
 * `canSelectAnyTeam` already established for a closely related "see more
 * than just my own" LMRA capability — reusing that precedent rather than
 * inventing a new set. Foreman is judged per-project (`isProjectForeman`,
 * resolved server-side), never a client-trusted flag. This is a UI-gating
 * function only, never broadens the underlying RLS read.
 */
export function canViewAllProjectLmra(roleNames: RoleName[], isProjectForeman: boolean): boolean {
  return isProjectForeman || roleNames.includes("hseq_manager") || roleNames.includes("company_admin") || roleNames.includes("operations_manager") || roleNames.includes("project_manager");
}
