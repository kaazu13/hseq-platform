import { createClient } from "@/lib/supabase/server";
import type { Project, ProjectAssignment, ProjectAssignmentRole, ProjectAssignmentWithEmployee } from "./types";

/**
 * Server-only data access for the projects domain — see
 * docs/API_CONVENTIONS.md §7. Plain queries filtered explicitly by
 * `company_id`/`project_id` (RLS also enforces this — see
 * supabase/migrations/20260728090000_projects_and_teams.sql — but explicit
 * scoping keeps index usage and intent readable). No PostgREST embeds, same
 * reason as modules/employees/queries.ts's header comment.
 */

/**
 * Every project visible to the caller in `companyId` — RLS
 * (projects_select) does the real scoping (company-wide roles see everything;
 * everyone else only their explicitly assigned projects). Ordered newest
 * first; this milestone doesn't paginate the project list (expected scale
 * is tens, not thousands, per company — see
 * docs/DATABASE_SCHEMA.md's Projects section for the same reasoning
 * employees search/pagination already documents at a different scale).
 */
export async function listProjects(companyId: string): Promise<Project[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/** A single project scoped to `companyId` — null if it doesn't exist, belongs to another company, or RLS hides it (indistinguishable by design, see docs/API_CONVENTIONS.md §6). */
export async function getProject(companyId: string, projectId: string): Promise<Project | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", projectId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * The CALLING user's own active project_assignments roles for `projectId` —
 * used only for UI-gating (show/hide the Edit/Manage actions), never as the
 * actual access-control decision (RLS + the Server Function's own
 * `is_project_manager()`-backed check are that). Empty when the caller has
 * no linked employee record, or no active assignment on this project.
 */
export async function getMyProjectAssignmentRoles(
  companyId: string,
  projectId: string,
  userId: string,
): Promise<ProjectAssignmentRole[]> {
  const supabase = await createClient();

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id")
    .eq("company_id", companyId)
    .eq("profile_id", userId)
    .maybeSingle();

  if (employeeError) throw employeeError;
  if (!employee) return [];

  const { data: assignments, error: assignmentsError } = await supabase
    .from("project_assignments")
    .select("assignment_role")
    .eq("project_id", projectId)
    .eq("employee_id", employee.id)
    .is("end_at", null);

  if (assignmentsError) throw assignmentsError;
  return (assignments ?? []).map((assignment) => assignment.assignment_role);
}

/**
 * Every currently-active project_assignments row for `projectId`, joined
 * with the assignee's basic employee info — the project's roster plus its
 * PM(s)/HSEQ Manager(s)/HSE Officer(s)/Inspector(s). Two queries rather
 * than a PostgREST embed (see this file's header comment), batched rather
 * than per-row.
 *
 * The employee half goes through `get_basic_employee_info()` (RPC), NOT a
 * raw `.from("employees").select(...)` — that RPC is the only channel that
 * exposes a project/team-mate's basic info (narrow columns, its own
 * authorization check); there is deliberately no RLS policy granting raw
 * `employees` row access to teammates. See
 * supabase/migrations/20260728090000_projects_and_teams.sql §15.
 */
export async function listProjectAssignments(companyId: string, projectId: string): Promise<ProjectAssignmentWithEmployee[]> {
  const supabase = await createClient();

  const { data: assignments, error: assignmentsError } = await supabase
    .from("project_assignments")
    .select("*")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .is("end_at", null)
    .order("created_at", { ascending: true });

  if (assignmentsError) throw assignmentsError;
  if (!assignments || assignments.length === 0) return [];

  const employeeIds = [...new Set(assignments.map((assignment) => assignment.employee_id))];
  const { data: employees, error: employeesError } = await supabase.rpc("get_basic_employee_info", {
    target_employee_ids: employeeIds,
  });

  if (employeesError) throw employeesError;
  const employeeById = new Map((employees ?? []).map((employee) => [employee.id, employee]));

  return assignments
    .filter((assignment) => employeeById.has(assignment.employee_id))
    .map((assignment) => ({ ...assignment, employee: employeeById.get(assignment.employee_id)! }));
}

/**
 * Employee ids currently rostered onto `projectId` (any active
 * project_assignments role, including plain `member`) — the candidate pool
 * the Team Assignment Selector draws from (docs from the milestone brief:
 * "Only Employees assigned to that Project should be selectable"). A plain
 * `Set` rather than full rows since callers already have (or will fetch)
 * full employee data elsewhere.
 */
export async function listProjectRosterEmployeeIds(companyId: string, projectId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_assignments")
    .select("employee_id")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .is("end_at", null);

  if (error) throw error;
  return new Set((data ?? []).map((row) => row.employee_id));
}

export type { ProjectAssignment };
