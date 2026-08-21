import type { RoleName } from "@/modules/companies/types";

/** Part 10 — company_admin/planner/platform_super_admin manage Pay Rules. Same set as canManageEmployeeRates() — compensation authority stays deliberately narrow and consistent across rates and pay rules. */
const PAY_RULE_MANAGE_ROLES: RoleName[] = ["company_admin", "planner"];

export function canManagePayRules(roleNames: RoleName[], isSuperAdmin: boolean): boolean {
  return isSuperAdmin || roleNames.some((role) => PAY_RULE_MANAGE_ROLES.includes(role));
}

/** Part 16 — Project Manager may READ pay rules (to understand a project labor estimate) but never edit them; canManagePayRules() above remains the only write gate. */
export function canReadPayRules(roleNames: RoleName[], isSuperAdmin: boolean, myProjectAssignmentRoles: string[]): boolean {
  return canManagePayRules(roleNames, isSuperAdmin) || myProjectAssignmentRoles.includes("project_manager");
}

/**
 * Part 16 — who may see an ESTIMATED LABOR COST figure at all, in either
 * scope: company_admin/planner/platform_super_admin (company-wide) OR
 * the project's own project_manager (project-scoped only — see
 * canViewProjectLaborCostOnly below for the narrower privacy rule that
 * applies to THEM specifically). operations_manager is deliberately
 * excluded — Part 16's explicit "do not expose compensation by default"
 * — even though they otherwise manage daily workforce/worked hours.
 */
export function canViewAnyLaborCost(roleNames: RoleName[], isSuperAdmin: boolean, myProjectAssignmentRoles: string[]): boolean {
  return canManagePayRules(roleNames, isSuperAdmin) || myProjectAssignmentRoles.includes("project_manager");
}

/** Part 16 — true when the caller's ONLY basis for seeing labor cost is being the project's own PM (not also company_admin/planner/PSA) — used to decide "project total only, no rate-history/change controls" vs. the fuller company-scope view. */
export function canViewProjectLaborCostOnly(roleNames: RoleName[], isSuperAdmin: boolean, myProjectAssignmentRoles: string[]): boolean {
  return !canManagePayRules(roleNames, isSuperAdmin) && myProjectAssignmentRoles.includes("project_manager");
}
