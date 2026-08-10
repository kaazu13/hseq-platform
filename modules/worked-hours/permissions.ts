import type { RoleName } from "@/modules/companies/types";

/**
 * Worked Hours role gates — mirror the RLS in
 * supabase/migrations/20260813090000_worked_hours.sql exactly (RLS is the
 * real enforcement; these functions only decide what to render). Deliberately
 * NARROWER than modules/daily-workforce/permissions.ts: this milestone's
 * "Expected direction" does not list Foreman/HSE/Inspector for worked
 * hours at all, only Administrator/Project Manager (manage) and Employee
 * (view own, report own discrepancy) — the stricter reading is preserved
 * per "if current role architecture makes any of these unsafe or
 * ambiguous, preserve the stricter permission."
 */

const COMPANY_WIDE_MANAGE_ROLES: RoleName[] = ["company_admin", "operations_manager"];

/** Entering/editing/submitting worked hours, or resolving a discrepancy — company-wide managers, or the project's own assigned Project Manager. */
export function canManageWorkedHours(roleNames: RoleName[], myProjectAssignmentRoles: string[]): boolean {
  return roleNames.some((role) => COMPANY_WIDE_MANAGE_ROLES.includes(role)) || myProjectAssignmentRoles.includes("project_manager");
}
