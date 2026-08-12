import { createClient } from "@/lib/supabase/server";
import type { DailyAttendance, DailyTeam, DailyTeamMemberWithEmployee, DailyTeamWithMembers, EmployeeDailyState, BasicEmployee } from "./types";

/**
 * Server-only data access for the Daily Workforce / Today's Teams domain —
 * see docs/API_CONVENTIONS.md §7. No PostgREST embeds (same reason as
 * modules/teams/queries.ts's header comment) — batched follow-up queries,
 * merged in JS. Designed to be imported directly by LMRA/Toolbox
 * Meetings/Safety Observations later (this milestone's Phase I) — plain
 * exported functions, no special "public API" boundary beyond normal
 * module exports.
 */

function sortByName<T extends { employee: { last_name: string; first_name: string } }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const lastNameCompare = a.employee.last_name.localeCompare(b.employee.last_name);
    return lastNameCompare !== 0 ? lastNameCompare : a.employee.first_name.localeCompare(b.employee.first_name);
  });
}

/** The caller's own linked employee id for `companyId`, or null if they have none — same inline pattern used across every module this session (modules/scaffolds/queries.ts, modules/toolbox-meetings/queries.ts, etc.), extracted here since the Employee Dashboard needs it as its first resolution step. */
export async function getMyEmployeeId(companyId: string, userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("employees").select("id").eq("company_id", companyId).eq("profile_id", userId).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/** True if the calling user has ANY current project/team assignment on `projectId` — same convention as every other module this session. */
export async function isCallerProjectAccessible(projectId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_project_access", { target_project_id: projectId });
  if (error) throw error;
  return data ?? false;
}

/**
 * Every Today's Team for (project, work_date), ordered by display_order,
 * each paired with its current (removed_at is null) foreman(s) and
 * workers — the Today's Teams grid's single data source.
 */
export async function listDailyTeamsForDate(companyId: string, projectId: string, workDate: string): Promise<DailyTeamWithMembers[]> {
  const supabase = await createClient();

  const { data: teams, error: teamsError } = await supabase
    .from("daily_teams")
    .select("*")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .eq("work_date", workDate)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (teamsError) throw teamsError;
  if (!teams || teams.length === 0) return [];

  const teamIds = teams.map((team) => team.id);
  const { data: members, error: membersError } = await supabase
    .from("daily_team_members")
    .select("*")
    .in("daily_team_id", teamIds)
    .is("removed_at", null);

  if (membersError) throw membersError;

  const employeeIds = [...new Set((members ?? []).map((member) => member.employee_id))];
  const employeeById = new Map<string, BasicEmployee>();
  if (employeeIds.length > 0) {
    const { data: employees, error: employeesError } = await supabase.rpc("get_basic_employee_info", { target_employee_ids: employeeIds });
    if (employeesError) throw employeesError;
    for (const employee of employees ?? []) employeeById.set(employee.id, employee);
  }

  const membersByTeamId = new Map<string, DailyTeamMemberWithEmployee[]>();
  for (const member of members ?? []) {
    const employee = employeeById.get(member.employee_id);
    if (!employee) continue;
    const bucket = membersByTeamId.get(member.daily_team_id) ?? [];
    bucket.push({ ...member, employee });
    membersByTeamId.set(member.daily_team_id, bucket);
  }

  return teams.map((team) => {
    const teamMembers = membersByTeamId.get(team.id) ?? [];
    return {
      ...team,
      foremen: sortByName(teamMembers.filter((member) => member.role === "foreman")),
      workers: sortByName(teamMembers.filter((member) => member.role === "member")),
    };
  });
}

/** A single Today's Team scoped to companyId/projectId/work_date — null if it doesn't exist, belongs elsewhere, or RLS hides it. */
export async function getDailyTeam(companyId: string, projectId: string, workDate: string, dailyTeamId: string): Promise<DailyTeam | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_teams")
    .select("*")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .eq("work_date", workDate)
    .eq("id", dailyTeamId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Every employee currently rostered onto `projectId` (an active
 * project_assignments row, any role), each annotated with their
 * daily_attendance status for `workDate` (defaulting to 'not_set' when no
 * row exists yet) and which Today's Team, if any, they're currently on for
 * that date — the worker picker's single data source (available/assigned/
 * unavailable distinction, "Only Employees assigned to that Project should
 * be selectable").
 */
export async function listWorkforceForDate(companyId: string, projectId: string, workDate: string): Promise<EmployeeDailyState[]> {
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

  const [{ data: employees, error: employeesError }, { data: attendance, error: attendanceError }, { data: memberships, error: membershipsError }, { data: teams, error: teamsError }, foremanIds] =
    await Promise.all([
      supabase.rpc("get_basic_employee_info", { target_employee_ids: employeeIds }),
      supabase.from("daily_attendance").select("employee_id, status, note").eq("company_id", companyId).eq("project_id", projectId).eq("work_date", workDate).in("employee_id", employeeIds),
      supabase.from("daily_team_members").select("employee_id, daily_team_id, shift").eq("company_id", companyId).eq("project_id", projectId).eq("work_date", workDate).is("removed_at", null).in("employee_id", employeeIds),
      supabase.from("daily_teams").select("id, name").eq("company_id", companyId).eq("project_id", projectId).eq("work_date", workDate),
      listEligibleForemanIds(companyId, projectId),
    ]);

  if (employeesError) throw employeesError;
  if (attendanceError) throw attendanceError;
  if (membershipsError) throw membershipsError;
  if (teamsError) throw teamsError;

  const attendanceByEmployeeId = new Map((attendance ?? []).map((row) => [row.employee_id, row]));
  const membershipByEmployeeId = new Map((memberships ?? []).map((row) => [row.employee_id, row]));
  const teamNameById = new Map((teams ?? []).map((team) => [team.id, team.name]));

  return (employees ?? [])
    .map((employee): EmployeeDailyState => {
      const attendanceRow = attendanceByEmployeeId.get(employee.id);
      const membership = membershipByEmployeeId.get(employee.id);
      return {
        employee,
        attendanceStatus: attendanceRow?.status ?? "not_set",
        attendanceNote: attendanceRow?.note ?? null,
        assignedTeam: membership ? { id: membership.daily_team_id, name: teamNameById.get(membership.daily_team_id) ?? "Unknown team", shift: membership.shift } : null,
        isEligibleForeman: foremanIds.has(employee.id),
      };
    })
    .sort((a, b) => {
      const lastNameCompare = a.employee.last_name.localeCompare(b.employee.last_name);
      return lastNameCompare !== 0 ? lastNameCompare : a.employee.first_name.localeCompare(b.employee.first_name);
    });
}

/**
 * Employee ids who genuinely hold the project's real Foreman role — reuses
 * is_eligible_scaffold_foreman()'s exact eligibility rule (company-wide
 * `foreman` role AND an open Foreman team_assignments row on this
 * project), the SAME check the Scaffold Register's own foreman picker
 * already relies on (supabase/migrations/20260805090000_scaffold_team_and_dimensions.sql)
 * — items 7/8's "use the EXISTING role catalogue, do not invent a new
 * Foreman role" requirement.
 */
export async function listEligibleForemanIds(companyId: string, projectId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_eligible_scaffold_foremen", { target_organization_id: companyId, target_project_id: projectId });
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.id));
}

/** One employee's resolved daily state for a single date — the Employee Dashboard's "Today" card data source. */
export async function getEmployeeDailyState(companyId: string, projectId: string, employeeId: string, workDate: string): Promise<EmployeeDailyState | null> {
  const supabase = await createClient();

  const [{ data: employees, error: employeeError }, { data: attendanceRow, error: attendanceError }, { data: membership, error: membershipError }] = await Promise.all([
    supabase.rpc("get_basic_employee_info", { target_employee_ids: [employeeId] }),
    supabase.from("daily_attendance").select("status, note").eq("company_id", companyId).eq("project_id", projectId).eq("employee_id", employeeId).eq("work_date", workDate).maybeSingle(),
    supabase.from("daily_team_members").select("daily_team_id, shift").eq("company_id", companyId).eq("project_id", projectId).eq("employee_id", employeeId).eq("work_date", workDate).is("removed_at", null).maybeSingle(),
  ]);

  if (employeeError) throw employeeError;
  if (attendanceError) throw attendanceError;
  if (membershipError) throw membershipError;

  const employee = employees?.[0];
  if (!employee) return null;

  let assignedTeam: EmployeeDailyState["assignedTeam"] = null;
  if (membership) {
    const { data: team, error: teamError } = await supabase.from("daily_teams").select("id, name").eq("id", membership.daily_team_id).maybeSingle();
    if (teamError) throw teamError;
    if (team) assignedTeam = { id: team.id, name: team.name, shift: membership.shift };
  }

  const foremanIds = await listEligibleForemanIds(companyId, projectId);

  return {
    employee,
    attendanceStatus: attendanceRow?.status ?? "not_set",
    attendanceNote: attendanceRow?.note ?? null,
    assignedTeam,
    isEligibleForeman: foremanIds.has(employee.id),
  };
}

/** A single attendance row (or null if never set) — used for the "is this employee currently assigned?" pre-check before showing the mark-unavailable confirmation dialog. */
export async function getDailyAttendance(companyId: string, projectId: string, employeeId: string, workDate: string): Promise<DailyAttendance | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_attendance")
    .select("*")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .eq("employee_id", employeeId)
    .eq("work_date", workDate)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * The most recent Today's Teams for a project across any date, newest
 * first — feeds the Safety Observation form's "target a Today's Team"
 * picker (modules/observations/components/observation-form.tsx), which
 * needs to let an HSE user pick a SPECIFIC day's team (never re-resolved
 * by name later — see supabase/migrations/20260814090000_observation_targeting.sql's
 * header comment). Not scoped to one date since an observation can be
 * recorded against a team from a recent day, not only "today."
 */
export async function listRecentDailyTeamsForProject(companyId: string, projectId: string, limit = 40): Promise<Pick<DailyTeam, "id" | "name" | "work_date">[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_teams")
    .select("id, name, work_date")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .order("work_date", { ascending: false })
    .order("display_order", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export type EmployeeTodayCard = {
  attendanceStatus: import("./types").DailyAttendanceStatus;
  team: (Pick<DailyTeam, "id" | "name" | "shift" | "work_area" | "activity"> & { foremanName: string | null }) | null;
};

/**
 * The Employee Dashboard's "TODAY" card data source (Phase F) — richer
 * than listWorkforceForDate's per-row shape (that one is for a manager
 * scanning the whole roster; this resolves the ONE team's foreman name
 * too, since the card shows "Foreman: Karl Andersson" directly).
 */
export async function getEmployeeTodayCard(companyId: string, projectId: string, employeeId: string, workDate: string): Promise<EmployeeTodayCard> {
  const supabase = await createClient();

  const [{ data: attendanceRow, error: attendanceError }, { data: membership, error: membershipError }] = await Promise.all([
    supabase.from("daily_attendance").select("status").eq("company_id", companyId).eq("project_id", projectId).eq("employee_id", employeeId).eq("work_date", workDate).maybeSingle(),
    supabase.from("daily_team_members").select("daily_team_id").eq("company_id", companyId).eq("project_id", projectId).eq("employee_id", employeeId).eq("work_date", workDate).is("removed_at", null).maybeSingle(),
  ]);
  if (attendanceError) throw attendanceError;
  if (membershipError) throw membershipError;

  if (!membership) {
    return { attendanceStatus: attendanceRow?.status ?? "not_set", team: null };
  }

  const { data: team, error: teamError } = await supabase
    .from("daily_teams")
    .select("id, name, shift, work_area, activity")
    .eq("id", membership.daily_team_id)
    .maybeSingle();
  if (teamError) throw teamError;
  if (!team) {
    return { attendanceStatus: attendanceRow?.status ?? "not_set", team: null };
  }

  const { data: foremanRows, error: foremanError } = await supabase
    .from("daily_team_members")
    .select("employee_id")
    .eq("daily_team_id", team.id)
    .eq("role", "foreman")
    .is("removed_at", null)
    .limit(1);
  if (foremanError) throw foremanError;

  let foremanName: string | null = null;
  if (foremanRows && foremanRows.length > 0) {
    const { data: foremen, error: foremenError } = await supabase.rpc("get_basic_employee_info", { target_employee_ids: [foremanRows[0].employee_id] });
    if (foremenError) throw foremenError;
    const foreman = foremen?.[0];
    if (foreman) foremanName = `${foreman.first_name} ${foreman.last_name}`;
  }

  return { attendanceStatus: attendanceRow?.status ?? "not_set", team: { ...team, foremanName } };
}

export type DailyTeamsArchiveDay = {
  workDate: string;
  teamCount: number;
  workerCount: number;
  locked: boolean;
};

/**
 * Every distinct date this project has had Today's Teams, newest first —
 * the Archive tab's list ("10 Aug 2026 · North Plant Expansion · 38
 * workers · Locked"). `locked` is true only when EVERY team for that date
 * is locked (a day only reads as fully "Locked" once nothing on it is
 * still open).
 */
export async function listDailyTeamsArchiveDays(companyId: string, projectId: string, limit = 60): Promise<DailyTeamsArchiveDay[]> {
  const supabase = await createClient();
  const { data: teams, error: teamsError } = await supabase
    .from("daily_teams")
    .select("id, work_date, status")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .order("work_date", { ascending: false });
  if (teamsError) throw teamsError;
  if (!teams || teams.length === 0) return [];

  const dates = [...new Set(teams.map((team) => team.work_date))].slice(0, limit);
  const teamIdsByDate = new Map<string, string[]>();
  const lockedByDate = new Map<string, boolean>();
  for (const team of teams) {
    if (!dates.includes(team.work_date)) continue;
    teamIdsByDate.set(team.work_date, [...(teamIdsByDate.get(team.work_date) ?? []), team.id]);
    lockedByDate.set(team.work_date, (lockedByDate.get(team.work_date) ?? true) && team.status === "locked");
  }

  const allTeamIds = [...teamIdsByDate.values()].flat();
  const { data: members, error: membersError } = await supabase
    .from("daily_team_members")
    .select("daily_team_id, employee_id")
    .in("daily_team_id", allTeamIds)
    .is("removed_at", null);
  if (membersError) throw membersError;

  const workerCountByDate = new Map<string, number>();
  for (const [date, teamIds] of teamIdsByDate) {
    const teamIdSet = new Set(teamIds);
    const workers = new Set((members ?? []).filter((member) => teamIdSet.has(member.daily_team_id)).map((member) => member.employee_id));
    workerCountByDate.set(date, workers.size);
  }

  return dates.map((workDate) => ({
    workDate,
    teamCount: teamIdsByDate.get(workDate)?.length ?? 0,
    workerCount: workerCountByDate.get(workDate) ?? 0,
    locked: lockedByDate.get(workDate) ?? false,
  }));
}
