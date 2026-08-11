import type { Database, Enums } from "@/types/database";

/**
 * Daily Workforce / Attendance + Today's Teams — see
 * supabase/migrations/20260812090000_daily_workforce_and_teams.sql.
 * Mirrors modules/teams/types.ts's shape (a friendly domain alias layer
 * over the generated Database type) but for the new, date-scoped tables —
 * see that migration's header comment for why this is a NEW pair of
 * tables, not a repurposing of teams/team_assignments.
 */
export type DailyAttendance = Database["public"]["Tables"]["daily_attendance"]["Row"];
export type DailyTeam = Database["public"]["Tables"]["daily_teams"]["Row"];
export type DailyTeamMember = Database["public"]["Tables"]["daily_team_members"]["Row"];

export type DailyAttendanceStatus = Enums<"daily_attendance_status">;
export type DailyTeamStatus = Enums<"daily_team_status">;
export type DailyTeamMemberRole = Enums<"team_assignment_role">;

export const DAILY_ATTENDANCE_STATUSES: DailyAttendanceStatus[] = ["not_set", "present", "absent", "sick", "leave", "training", "off_site"];

export const DAILY_ATTENDANCE_STATUS_LABELS: Record<DailyAttendanceStatus, string> = {
  not_set: "Not set",
  present: "Present",
  absent: "Absent",
  sick: "Sick",
  leave: "Vacation / Leave",
  training: "Training",
  off_site: "Off site",
};

/**
 * The TS-side mirror of daily_attendance_permits_work() in the migration —
 * kept in exact sync BY HAND (documented on both sides) since there's no
 * practical way to share one literal list between Postgres and TypeScript
 * in this codebase's toolchain. The database trigger
 * (validate_daily_team_member_insert()) is the real, authoritative
 * enforcement; this is only what the UI uses to grey out/hide the option
 * before ever reaching the server.
 */
export const DAILY_ATTENDANCE_STATUSES_PERMITTING_WORK: readonly DailyAttendanceStatus[] = ["not_set", "present"];

export function dailyAttendancePermitsWork(status: DailyAttendanceStatus): boolean {
  return DAILY_ATTENDANCE_STATUSES_PERMITTING_WORK.includes(status);
}

/**
 * The narrow, approved column set get_basic_employee_info() returns — same
 * convention as every other module this session (modules/teams/types.ts,
 * modules/scaffolds/types.ts). The one sanctioned channel for resolving a
 * teammate's display name; there is no raw RLS SELECT policy on
 * `employees` for teammates.
 */
export type BasicEmployee = Database["public"]["Functions"]["get_basic_employee_info"]["Returns"][number];

/** One daily team's members, split into foreman(s) and workers for direct rendering — mirrors modules/teams/types.ts's TeamWithAssignments split. */
export type DailyTeamMemberWithEmployee = DailyTeamMember & {
  employee: BasicEmployee;
};

export type DailyTeamWithMembers = DailyTeam & {
  foremen: DailyTeamMemberWithEmployee[];
  workers: DailyTeamMemberWithEmployee[];
};

/** One employee's resolved daily-workforce state for a project/date — the shape the worker picker and attendance sheet both render from. */
export type EmployeeDailyState = {
  employee: BasicEmployee;
  attendanceStatus: DailyAttendanceStatus;
  attendanceNote: string | null;
  /** The daily team (if any) this employee is currently assigned to for this date/shift. */
  assignedTeam: { id: string; name: string; shift: string | null } | null;
};

/** True when an employee's current daily state permits assigning them to a team — mirrors dailyAttendancePermitsWork(), applied to the resolved state rather than a raw status. */
export function employeeIsAvailableForAssignment(state: Pick<EmployeeDailyState, "attendanceStatus">): boolean {
  return dailyAttendancePermitsWork(state.attendanceStatus);
}

export type DailyWorkforceSummary = {
  rosterSize: number;
  presentCount: number;
  unavailableCount: number;
  notAssignedCount: number;
  assignedCount: number;
  /** Attendance never recorded for this date at all — distinct from "not assigned" (which already has a permits-work status, just no team yet). The PM Daily Overview's "Incomplete daily workforce state" action-required card. */
  incompleteAttendanceCount: number;
};

/** Aggregates a day's full roster into the PM Daily Overview's "Today" counts (Phase 7) — the single source both the overview cards and (if ever needed elsewhere) any other daily-workforce summary should derive from, rather than re-deriving these filters ad hoc per caller. */
export function summarizeDailyWorkforce(workforce: Pick<EmployeeDailyState, "attendanceStatus" | "assignedTeam">[]): DailyWorkforceSummary {
  return {
    rosterSize: workforce.length,
    presentCount: workforce.filter((state) => state.attendanceStatus === "present").length,
    unavailableCount: workforce.filter((state) => !dailyAttendancePermitsWork(state.attendanceStatus)).length,
    assignedCount: workforce.filter((state) => state.assignedTeam !== null).length,
    notAssignedCount: workforce.filter((state) => dailyAttendancePermitsWork(state.attendanceStatus) && state.assignedTeam === null).length,
    incompleteAttendanceCount: workforce.filter((state) => state.attendanceStatus === "not_set").length,
  };
}
