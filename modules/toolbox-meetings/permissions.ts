import type { RoleName } from "@/modules/companies/types";

/**
 * Permission checks for Toolbox Meetings — see
 * docs/ROLES_AND_PERMISSIONS.md §5's Toolbox Meetings row (— | V | V | V⁴ |
 * F | M⁴ | V⁴ | V⁴ | — | — | V⁴) and footnote 19. HSE Manager is
 * unrestricted company-wide ("F"). HSE Officer gets "M⁴" (project-scoped
 * manage — create/edit/archive/replace within their assigned project).
 * Foreman/Project Manager/Inspector/Employee are all view-only — this
 * module has no digital delivery workflow for a Foreman to run, unlike
 * LMRA — mirrors modules/scaffolds/permissions.ts's shape exactly.
 */

const MANAGE_TIER_ROLES: RoleName[] = ["hse_officer"];

export function canManageToolboxMeeting(roleNames: RoleName[], hasProjectAccess: boolean): boolean {
  if (roleNames.includes("hseq_manager")) return true;
  return hasProjectAccess && roleNames.some((role) => MANAGE_TIER_ROLES.includes(role));
}
