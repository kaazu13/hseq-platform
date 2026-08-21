import type { RoleName } from "@/modules/companies/types";

/**
 * Part 6 — who may APPROVE/REJECT a rate request. Same deliberately
 * narrow set as canManageEmployeeRates() (modules/rates/permissions.ts) —
 * company_admin/planner/platform_super_admin. project_manager and
 * operations_manager are explicitly excluded (read-only for PM, no
 * standing at all for operations_manager, per spec).
 */
const RATE_REQUEST_REVIEW_ROLES: RoleName[] = ["company_admin", "planner"];

export function canReviewRateRequests(roleNames: RoleName[], isSuperAdmin: boolean): boolean {
  return isSuperAdmin || roleNames.some((role) => RATE_REQUEST_REVIEW_ROLES.includes(role));
}

/** Part 9 — Project Manager gets read-only visibility into rate requests for employees in their own project(s); never review authority (canReviewRateRequests above is the only decision gate). */
export function canReadProjectRateRequests(myProjectAssignmentRoles: string[]): boolean {
  return myProjectAssignmentRoles.includes("project_manager");
}
