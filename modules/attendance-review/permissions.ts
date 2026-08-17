import type { RoleName } from "@/modules/companies/types";

/**
 * Task 3 Part 19 — the reviewer tier for attendance-review requests:
 * project_manager (scoped to that specific project, via `myProjectAssignmentRoles`),
 * operations_manager/company_admin (company-wide), or platform_super_admin
 * (checked separately at the call site — see modules/lmra/permissions.ts's
 * established isPlatformSuperAdmin()-OR'd-in convention). Deliberately
 * narrower than modules/daily-workforce/permissions.ts's
 * canManageDailyWorkforce (which also includes hseq_manager/hse_officer/
 * foreman) — mirrors is_attendance_reviewer() in the migration exactly.
 */
export function canReviewAttendance(roleNames: RoleName[], myProjectAssignmentRoles: string[]): boolean {
  return roleNames.includes("company_admin") || roleNames.includes("operations_manager") || myProjectAssignmentRoles.includes("project_manager");
}
