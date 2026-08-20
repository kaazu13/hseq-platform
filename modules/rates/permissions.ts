import type { RoleName } from "@/modules/companies/types";

/**
 * Part 18 — RATE SECURITY. Deliberately narrow: platform_super_admin
 * (global), company_admin + planner (company-wide) may view/manage ANY
 * employee's rate. Project Manager/Operations Manager get NOTHING here
 * even though they manage projects/workforce elsewhere — compensation is
 * private data, not workforce-operational data, and the task is explicit
 * that PM/Operations Manager must not be silently granted access "merely
 * because they manage a project." An employee always sees their OWN rate
 * regardless of role (checked separately at each call site via
 * employee_id/profile match, not through this function).
 */
const RATE_MANAGE_ROLES: RoleName[] = ["company_admin", "planner"];

export function canManageEmployeeRates(roleNames: RoleName[], isSuperAdmin: boolean): boolean {
  return isSuperAdmin || roleNames.some((role) => RATE_MANAGE_ROLES.includes(role));
}
