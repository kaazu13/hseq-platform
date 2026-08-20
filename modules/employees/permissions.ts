import type { RoleName } from "@/modules/companies/types";

/**
 * Employee module role gates — mirror the database-level rules exactly
 * (supabase/migrations/20260725091100_role_helper_and_employees_rls.sql,
 * 20260725091200_membership_roles_management.sql,
 * 20260726120000_role_catalogue_update.sql) so the UI never offers an
 * action the database would reject anyway. RLS is the real enforcement;
 * these functions only decide what to render — see docs/API_CONVENTIONS.md
 * §6 ("RLS is the backstop, not the only check").
 */

/** May create/edit/archive employee records and assign roles (subject to `assignableRoleNamesFor` below). */
export const EMPLOYEE_WRITE_ROLES: RoleName[] = ["company_admin", "operations_manager"];

/**
 * May view the full company employee list/detail, read-only.
 * Deliberately does NOT include `foreman`, `hse_officer`, or `recruiter`
 * (Role Catalogue & Permissions milestone) — all three are meant to be
 * project-scoped once the Projects module exists; granting them
 * company-wide employee visibility now would be a permission this
 * milestone would have to walk back later, not a safe default. `recruiter`
 * additionally gets its own, separate, much narrower future Talent Pool
 * surface instead of this list — see docs/PRODUCT_REQUIREMENTS.md §11.6.
 */
export const EMPLOYEE_READ_ROLES: RoleName[] = [
  "company_admin",
  "operations_manager",
  "hseq_manager",
  "project_manager",
  "inspector",
  "planner",
];

export function canManageEmployees(roleNames: RoleName[]): boolean {
  return roleNames.some((role) => EMPLOYEE_WRITE_ROLES.includes(role));
}

export function canViewEmployeeDirectory(roleNames: RoleName[]): boolean {
  return roleNames.some((role) => EMPLOYEE_READ_ROLES.includes(role));
}

/** Same write gate as employee records — company_admin and operations_manager may open the Roles tab's assignment controls. */
export function canManageEmployeeRoles(roleNames: RoleName[]): boolean {
  return canManageEmployees(roleNames);
}

/** Same write gate as employee records — mirrors employee_employment_periods_insert/_update RLS (supabase/migrations/20260727090000_employment_periods.sql §8) exactly: only company_admin/operations_manager may end or rehire. */
export function canManageEmploymentLifecycle(roleNames: RoleName[]): boolean {
  return canManageEmployees(roleNames);
}

/**
 * Roles `operations_manager` (Workforce Coordinator) may never assign or
 * remove, even though it otherwise holds the same employee-role-management
 * gate as `company_admin` (Company Manager) — per the Role Catalogue &
 * Permissions milestone: a Workforce Coordinator must never promote anyone
 * into an elevated or specialist-management role. Company Manager itself
 * (via `assignableRoleNamesFor`'s `isCompanyAdmin` branch below) has no such
 * restriction beyond the platform-wide `platform_super_admin` exclusion.
 */
const OPERATIONS_MANAGER_FORBIDDEN_ASSIGNMENTS: RoleName[] = [
  "company_admin",
  "project_manager",
  "hseq_manager",
  "hse_officer",
  "foreman",
  "recruiter",
];

/**
 * Roles the signed-in user may assign to an employee via the Roles tab.
 * `platform_super_admin` is never assignable through this UI, for anyone.
 * A `company_admin` may assign any other role. An `operations_manager`
 * (acting without `company_admin`) may only assign `operations_manager`
 * itself, `inspector`, `planner`, or `employee` — never anything in
 * `OPERATIONS_MANAGER_FORBIDDEN_ASSIGNMENTS`. Mirrors
 * `membership_roles_insert_managers`/`membership_roles_delete_managers`
 * exactly; if these two ever drift, the database policy wins. Effective
 * permissions still follow the union rule (docs/ROLES_AND_PERMISSIONS.md §2)
 * — someone holding both `company_admin` and `operations_manager` gets the
 * unrestricted `company_admin` allowance, never the narrower one.
 */
export function assignableRoleNamesFor(actorRoleNames: RoleName[], allRoleNames: RoleName[]): RoleName[] {
  const isCompanyAdmin = actorRoleNames.includes("company_admin");
  return allRoleNames.filter((role) => {
    if (role === "platform_super_admin") return false;
    if (isCompanyAdmin) return true;
    return !OPERATIONS_MANAGER_FORBIDDEN_ASSIGNMENTS.includes(role);
  });
}

/** Part 9 of the operational UX package — a management-only account (holding ONLY these company roles) must never be assignable as an ordinary worker (Today's Team member, scaffold erection crew) by someone ELSE. The real enforcement is server-side (is_employee_assignable_as_worker(), 20260902150000_management_self_participation_rule.sql) — this mirror only decides what to render/offer in a picker, and only applies when the account holds NO role outside this set (a multi-role account, e.g. project_manager + foreman, is unaffected). */
export const MANAGEMENT_ONLY_ROLES: RoleName[] = ["platform_super_admin", "company_admin", "project_manager", "planner"];

export function isAssignableAsOrdinaryWorker(roleNames: RoleName[]): boolean {
  if (roleNames.length === 0) return true;
  return roleNames.some((role) => !MANAGEMENT_ONLY_ROLES.includes(role));
}
