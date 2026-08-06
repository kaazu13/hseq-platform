import type { RoleName } from "@/modules/companies/types";

/**
 * Project module role gates — mirror the RLS in
 * supabase/migrations/20260728090000_projects_and_teams.sql exactly (RLS is
 * the real enforcement; these functions only decide what to render — see
 * docs/API_CONVENTIONS.md §6). Unlike modules/employees/permissions.ts,
 * project-level write access isn't fully decidable from role names alone:
 * an assigned Project Manager may manage their OWN project even without
 * holding an company-wide role, and "is this the caller's project" is a
 * per-project fact the caller must supply (resolved via
 * modules/projects/queries.ts's `getMyProjectAssignmentRoles`), not
 * something derivable from `RoleName[]` in isolation.
 */

/** Creating a project (before any assignment can exist) is company-wide-role-only — see projects_insert RLS. */
export const PROJECT_CREATE_ROLES: RoleName[] = ["company_admin", "operations_manager"];

export function canCreateProjects(roleNames: RoleName[]): boolean {
  return roleNames.some((role) => PROJECT_CREATE_ROLES.includes(role));
}

const PROJECT_ORG_WIDE_MANAGE_ROLES: RoleName[] = ["company_admin", "operations_manager"];

/**
 * Editing a project's core fields, managing its Teams, or managing its
 * project_assignments roster — company-wide managers, or the project's own
 * assigned Project Manager (mirrors is_project_manager() in the migration).
 * `myProjectAssignmentRoles` is the caller's OWN active project_assignments
 * roles for THIS specific project, from `getMyProjectAssignmentRoles()`.
 */
export function canManageProject(roleNames: RoleName[], myProjectAssignmentRoles: string[]): boolean {
  return roleNames.some((role) => PROJECT_ORG_WIDE_MANAGE_ROLES.includes(role)) || myProjectAssignmentRoles.includes("project_manager");
}
