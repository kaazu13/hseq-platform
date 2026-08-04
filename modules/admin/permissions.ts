import type { RoleName } from "@/modules/organizations/types";

/**
 * Permission checks for the /admin/members organization-administration
 * page — same gate as modules/employees/permissions.ts's
 * EMPLOYEE_WRITE_ROLES (company_admin/operations_manager), reused rather
 * than redefined so the two can never silently drift: this page is a
 * superset UI over the same underlying membership_roles/organization_memberships
 * management capability the employee Roles tab already exposes.
 */
export const ORGANIZATION_ADMIN_ROLES: RoleName[] = ["company_admin", "operations_manager"];

export function canAdministerOrganization(roleNames: RoleName[]): boolean {
  return roleNames.some((role) => ORGANIZATION_ADMIN_ROLES.includes(role));
}
