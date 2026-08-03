import type { RoleName } from "@/modules/organizations/types";

/**
 * Permission checks for Safety Flash — see
 * docs/ROLES_AND_PERMISSIONS.md §5's Safety Flash row (— | V | V | V⁴ | F
 * | M⁴ ²⁰ | V⁴ | V⁴ | — | — | V⁴) and footnote 20. `project_id` is
 * optional, so unlike modules/toolbox-meetings/permissions.ts,
 * `hasProjectAccess` is only checked when a project is actually named —
 * an HSE Officer may create/manage an organization-wide flash (no
 * project) without holding any project assignment at all.
 */

const MANAGE_TIER_ROLES: RoleName[] = ["hse_officer"];

export function canManageSafetyFlash(roleNames: RoleName[], projectId: string | null, hasProjectAccess: boolean): boolean {
  if (roleNames.includes("hseq_manager")) return true;
  if (!roleNames.some((role) => MANAGE_TIER_ROLES.includes(role))) return false;
  return projectId === null || hasProjectAccess;
}
