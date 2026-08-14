import type { RoleName } from "@/modules/companies/types";

/**
 * Equipment management authority — mirrors is_equipment_manage_tier() in
 * supabase/migrations/20260827090000_equipment.sql exactly, which itself
 * mirrors modules/daily-workforce/permissions.ts's canManageDailyWorkforce()
 * role set verbatim (company_admin/operations_manager company-wide, or
 * project_manager scoped to their OWN project). No new role invented —
 * per the task's explicit instruction not to invent "Coordinator"/"Company
 * Manager" from conversational labels.
 *
 * `targetProjectId` is the ITEM's own project scope (null = company-wide
 * item) — a project_manager can only manage items already allocated to
 * their own project, never company-wide (null-project) stock, since a
 * PM's authority is inherently project-scoped. `myProjectAssignmentRoles`
 * is only meaningful when `targetProjectId` is the project the caller was
 * resolved against — callers must pass the roles resolved for THAT
 * specific project, same trust boundary as canManageDailyWorkforce.
 */
const COMPANY_WIDE_EQUIPMENT_MANAGE_ROLES: RoleName[] = ["company_admin", "operations_manager"];

/**
 * `targetProjectId` is the project scope being checked — pass a specific
 * item's own `project_id` for a per-item check (null = company-wide
 * item), or the caller's active project id to decide whether to render
 * the management surface (Add Item, manage-tier actions, Requests review
 * tab) at all for that project context. Same function either way — a
 * project_manager's authority is always scoped to one specific,
 * non-null project id.
 */
export function canManageEquipment(roleNames: RoleName[], targetProjectId: string | null, myProjectAssignmentRoles: string[]): boolean {
  return roleNames.some((role) => COMPANY_WIDE_EQUIPMENT_MANAGE_ROLES.includes(role)) || (targetProjectId !== null && myProjectAssignmentRoles.includes("project_manager"));
}
