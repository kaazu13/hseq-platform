import type { RoleName } from "@/modules/companies/types";

/**
 * LMRA module role gates — mirror the RLS in
 * supabase/migrations/20260801090000_lmra.sql exactly (RLS is the real
 * enforcement; these functions only decide what to render — see
 * docs/API_CONVENTIONS.md §6). Deliberately NOT the "company_admin/
 * operations_manager can always write" shape every other module in this
 * codebase uses — docs/ROLES_AND_PERMISSIONS.md §5's LMRA row gives
 * Company Manager/Workforce Coordinator View only ("V"), same tier as
 * Project Manager/HSE Officer/Inspector. HSE Manager holds Full ("F");
 * Foreman holds Manage ("M⁴" — create/view/edit/approve within their
 * assigned project/team, but not archive).
 */

/**
 * Can create/edit/submit/review-approve an LMRA for a specific project.
 * `isProjectForeman` is the caller's OWN foreman standing on THIS
 * project (from is_project_foreman() via a query — the caller is
 * responsible for scoping it to the right project, same trust boundary as
 * modules/projects/permissions.ts's canManageProject).
 */
export function canManageLmra(roleNames: RoleName[], isProjectForeman: boolean): boolean {
  return roleNames.includes("hseq_manager") || isProjectForeman;
}

/** Archiving is HSE Manager only — Foreman's "Manage" tier explicitly excludes it (docs/ROLES_AND_PERMISSIONS.md §3's F-vs-M legend). */
export function canArchiveLmra(roleNames: RoleName[]): boolean {
  return roleNames.includes("hseq_manager");
}
