import type { Database, Enums } from "@/types/database";

/**
 * Projects — see docs/DATABASE_SCHEMA.md's `projects`/`project_assignments`
 * sections and supabase/migrations/20260728090000_projects_and_teams.sql.
 * Mirrors modules/employees/types.ts's shape: a friendly domain alias layer
 * over the generated Database type, plus the fixed-vocabulary constants the
 * UI renders from.
 */
export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type ProjectAssignment = Database["public"]["Tables"]["project_assignments"]["Row"];

export type ProjectStatus = Enums<"project_status">;
export type ProjectAssignmentRole = Enums<"project_assignment_role">;

export const PROJECT_STATUSES: ProjectStatus[] = ["planning", "active", "completed", "archived"];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: "Planning",
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

/**
 * The four manager-tier roles plus plain roster inclusion — deliberately
 * excludes `foreman`, whose project-level visibility comes from an active
 * `team_assignments` row instead (see the migration's header comment).
 */
export const PROJECT_ASSIGNMENT_ROLES: ProjectAssignmentRole[] = [
  "project_manager",
  "hseq_manager",
  "hse_officer",
  "inspector",
  "member",
];

/** Matches roles.display_label for the same role keys — see docs/ROLES_AND_PERMISSIONS.md §1. */
export const PROJECT_ASSIGNMENT_ROLE_LABELS: Record<ProjectAssignmentRole, string> = {
  project_manager: "Project Manager",
  hseq_manager: "HSE Manager",
  hse_officer: "HSE Officer",
  inspector: "Inspector",
  member: "Member",
};

/**
 * The narrow, approved column set `get_basic_employee_info()` returns —
 * the ONLY channel that resolves a project/team-mate's display info (no
 * raw `.from("employees").select(...)`, and no RLS policy grants teammates
 * raw row access at all — see
 * supabase/migrations/20260728090000_projects_and_teams.sql §15). Deriving
 * this from the RPC's own return shape, not a `Pick` over the full
 * `employees` Row, keeps the type honest about what's actually reachable
 * here if the approved column set ever changes.
 */
export type BasicEmployee = Database["public"]["Functions"]["get_basic_employee_info"]["Returns"][number];

/** A project_assignments row joined with the assignee's basic employee info — never a PostgREST embed, see modules/employees/queries.ts's header comment for why. */
export type ProjectAssignmentWithEmployee = ProjectAssignment & {
  employee: BasicEmployee;
};
