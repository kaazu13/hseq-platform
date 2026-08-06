import type { RoleName } from "@/modules/companies/types";

/**
 * Permission checks for Toolbox Templates — see
 * docs/ROLES_AND_PERMISSIONS.md §5's Toolbox Templates row (— | V | V | V
 * | F | M | V | V | — | — | —). No project dimension at all (an
 * company-wide library), so unlike every other module this session
 * there is no `hasProjectAccess` parameter — HSE Manager AND HSE Officer
 * both get straightforward company-wide manage access. Employee has
 * no access at all — templates are an HSE planning resource.
 */

const MANAGE_TIER_ROLES: RoleName[] = ["hseq_manager", "hse_officer"];
const VIEW_TIER_ROLES: RoleName[] = ["company_admin", "operations_manager", "hseq_manager", "hse_officer", "project_manager", "foreman", "inspector"];

export function canManageToolboxTemplate(roleNames: RoleName[]): boolean {
  return roleNames.some((role) => MANAGE_TIER_ROLES.includes(role));
}

export function canViewToolboxTemplate(roleNames: RoleName[]): boolean {
  return roleNames.some((role) => VIEW_TIER_ROLES.includes(role));
}
