import type { RoleName } from "@/modules/companies/types";

/**
 * Permission checks for the /admin/members company-administration
 * page — same gate as modules/employees/permissions.ts's
 * EMPLOYEE_WRITE_ROLES (company_admin/operations_manager), reused rather
 * than redefined so the two can never silently drift: this page is a
 * superset UI over the same underlying membership_roles/company_memberships
 * management capability the employee Roles tab already exposes.
 */
export const COMPANY_ADMIN_ROLES: RoleName[] = ["company_admin", "operations_manager"];

export function canAdministerCompany(roleNames: RoleName[]): boolean {
  return roleNames.some((role) => COMPANY_ADMIN_ROLES.includes(role));
}
