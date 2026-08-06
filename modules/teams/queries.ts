import { createClient } from "@/lib/supabase/server";
import type { ProjectRosterCandidate, Team, TeamAssignmentWithEmployee, TeamWithAssignments } from "./types";

/**
 * Server-only data access for the teams domain — see docs/API_CONVENTIONS.md
 * §7. No PostgREST embeds, same reason as modules/employees/queries.ts's
 * header comment: batched follow-up queries instead, merged in JS.
 */

function sortByName<T extends { employee: { last_name: string; first_name: string } }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const lastNameCompare = a.employee.last_name.localeCompare(b.employee.last_name);
    return lastNameCompare !== 0 ? lastNameCompare : a.employee.first_name.localeCompare(b.employee.first_name);
  });
}

/**
 * Every team in `projectId`, ordered by `display_order` (never
 * alphabetically — see teams.display_order's column comment), each paired
 * with its CURRENT (end_at is null) foreman(s) and members. Empty teams
 * are included with empty arrays — this is the Team Cards page's single
 * data source; it deliberately never surfaces closed/historical
 * team_assignments rows.
 *
 * The employee half goes through `get_basic_employee_info()` (RPC), never
 * a raw `.from("employees").select(...)` — see this file's header comment
 * and supabase/migrations/20260728090000_projects_and_teams.sql §15.
 */
export async function listTeamsWithAssignments(companyId: string, projectId: string): Promise<TeamWithAssignments[]> {
  const supabase = await createClient();

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("*")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (teamsError) throw teamsError;
  if (!teams || teams.length === 0) return [];

  const teamIds = teams.map((team) => team.id);
  const { data: assignments, error: assignmentsError } = await supabase
    .from("team_assignments")
    .select("*")
    .in("team_id", teamIds)
    .is("end_at", null);

  if (assignmentsError) throw assignmentsError;

  const employeeIds = [...new Set((assignments ?? []).map((assignment) => assignment.employee_id))];
  const employeeById = new Map<string, TeamAssignmentWithEmployee["employee"]>();
  if (employeeIds.length > 0) {
    const { data: employees, error: employeesError } = await supabase.rpc("get_basic_employee_info", {
      target_employee_ids: employeeIds,
    });

    if (employeesError) throw employeesError;
    for (const employee of employees ?? []) employeeById.set(employee.id, employee);
  }

  const assignmentsWithEmployeeByTeamId = new Map<string, TeamAssignmentWithEmployee[]>();
  for (const assignment of assignments ?? []) {
    const employee = employeeById.get(assignment.employee_id);
    if (!employee) continue;
    const bucket = assignmentsWithEmployeeByTeamId.get(assignment.team_id) ?? [];
    bucket.push({ ...assignment, employee });
    assignmentsWithEmployeeByTeamId.set(assignment.team_id, bucket);
  }

  return teams.map((team) => {
    const teamAssignments = assignmentsWithEmployeeByTeamId.get(team.id) ?? [];
    return {
      ...team,
      foremen: sortByName(teamAssignments.filter((assignment) => assignment.assignment_role === "foreman")),
      members: sortByName(teamAssignments.filter((assignment) => assignment.assignment_role === "member")),
    };
  });
}

/** A single team scoped to `companyId`/`projectId` — null if it doesn't exist, belongs elsewhere, or RLS hides it. */
export async function getTeam(companyId: string, projectId: string, teamId: string): Promise<Team | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .eq("id", teamId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Every employee currently rostered onto `projectId` (an active
 * project_assignments row, any role — see modules/projects/queries.ts's
 * `listProjectRosterEmployeeIds`), each annotated with their current team
 * in this SAME project, if any — feeds a Team dialog's assignment picker
 * ("Only Employees assigned to that Project should be selectable"; an
 * employee already on a different team shows where, since selecting them
 * here moves them per move_employee_to_team()'s close-then-open semantics).
 */
export async function listProjectRosterCandidates(companyId: string, projectId: string): Promise<ProjectRosterCandidate[]> {
  const supabase = await createClient();

  const { data: roster, error: rosterError } = await supabase
    .from("project_assignments")
    .select("employee_id")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .is("end_at", null);

  if (rosterError) throw rosterError;
  const employeeIds = [...new Set((roster ?? []).map((row) => row.employee_id))];
  if (employeeIds.length === 0) return [];

  const [{ data: employees, error: employeesError }, { data: currentAssignments, error: assignmentsError }, { data: teams, error: teamsError }] =
    await Promise.all([
      supabase.rpc("get_basic_employee_info", { target_employee_ids: employeeIds }),
      supabase
        .from("team_assignments")
        .select("employee_id, team_id, assignment_role")
        .eq("company_id", companyId)
        .eq("project_id", projectId)
        .is("end_at", null)
        .in("employee_id", employeeIds),
      supabase.from("teams").select("id, name").eq("company_id", companyId).eq("project_id", projectId),
    ]);

  if (employeesError) throw employeesError;
  if (assignmentsError) throw assignmentsError;
  if (teamsError) throw teamsError;

  const teamNameById = new Map((teams ?? []).map((team) => [team.id, team.name]));
  const currentByEmployeeId = new Map((currentAssignments ?? []).map((assignment) => [assignment.employee_id, assignment]));

  return (employees ?? [])
    .map((employee) => {
      const current = currentByEmployeeId.get(employee.id);
      return {
        employee,
        currentTeamId: current?.team_id ?? null,
        currentTeamName: current ? (teamNameById.get(current.team_id) ?? null) : null,
        currentRole: current?.assignment_role ?? null,
      };
    })
    .sort((a, b) => {
      const lastNameCompare = a.employee.last_name.localeCompare(b.employee.last_name);
      return lastNameCompare !== 0 ? lastNameCompare : a.employee.first_name.localeCompare(b.employee.first_name);
    });
}
