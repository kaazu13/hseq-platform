import type { RoleName } from "@/modules/companies/types";
import { canManageProject } from "@/modules/projects/permissions";

/**
 * Team write access is identical to project write access — creating/
 * editing Teams and managing team_assignments are both gated by
 * `teams_insert`/`_update`/`team_assignments_insert`/`_update` RLS, which
 * use the exact same "company-wide manager OR this project's assigned Project
 * Manager" condition as `projects_update` (see
 * supabase/migrations/20260728090000_projects_and_teams.sql). A distinct
 * named function anyway — not just a re-export of `canManageProject` —
 * so team components read clearly about what they're gating, matching
 * modules/employees/permissions.ts's `canManageEmployeeRoles` aliasing
 * `canManageEmployees` for the same readability reason.
 */
export function canManageTeams(roleNames: RoleName[], myProjectAssignmentRoles: string[]): boolean {
  return canManageProject(roleNames, myProjectAssignmentRoles);
}
