import type { Database, Enums } from "@/types/database";
import { LMRA_SHIFTS, LMRA_SHIFT_LABELS, type LmraShift } from "@/modules/lmra/types";

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

/**
 * daily_teams.shift/daily_team_members.shift became controlled
 * (supabase/migrations/20260820090000_daily_team_shift_and_assignment_fixes.sql)
 * — reusing the SAME `lmra_shift` enum LMRA already used, rather than a
 * second, parallel controlled vocabulary. Re-exported here under a
 * daily-workforce-local name for readability at call sites; the type and
 * label map are identical to modules/lmra/types.ts's own.
 */
export type DailyTeamShift = LmraShift;
export const DAILY_TEAM_SHIFTS: DailyTeamShift[] = LMRA_SHIFTS;
export const DAILY_TEAM_SHIFT_LABELS: Record<DailyTeamShift, string> = LMRA_SHIFT_LABELS;

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
  assignedTeam: { id: string; name: string; shift: DailyTeamShift | null } | null;
  /** Holds the project's real, existing Foreman role (is_eligible_scaffold_foreman()) — items 7/8's "foreman picker only shows foremen / worker picker excludes foremen" filtering key. Never invented from a UI label. */
  isEligibleForeman: boolean;
};

/** True when an employee's current daily state permits assigning them to a team — mirrors dailyAttendancePermitsWork(), applied to the resolved state rather than a raw status. */
export function employeeIsAvailableForAssignment(state: Pick<EmployeeDailyState, "attendanceStatus">): boolean {
  return dailyAttendancePermitsWork(state.attendanceStatus);
}

export type ForemanGroup<T extends DailyTeamWithMembers> = { foremanId: string | null; foremanName: string; items: T[] };

/**
 * Item 5: Today's Teams' primary grouping is the responsible Foreman, not
 * shift — shift stays a per-card attribute and remains fully in the data
 * model, just no longer the heading key. "No Foreman Assigned" is the
 * explicit fallback for legacy/broken records only (still grouped, still
 * respects display_order — nothing silently disappears); new teams always
 * require a foreman (create_daily_team_with_foreman()), so this bucket
 * should only ever hold pre-existing historical rows. A team with more
 * than one foreman (unusual, but the data model allows it) groups under
 * its FIRST foreman only — the same "first" convention used for that
 * team's own foreman-count singular/plural label. Groups sort by foreman
 * name, with "No Foreman Assigned" always last; within a group, `items`
 * keeps its input order, i.e. whatever the caller already sorted by
 * display_order.
 */
export function groupTeamsByForeman<T extends DailyTeamWithMembers>(items: T[]): ForemanGroup<T>[] {
  const groups = new Map<string, ForemanGroup<T>>();
  for (const item of items) {
    const foreman = item.foremen[0] ?? null;
    const key = foreman?.employee.id ?? "__none";
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(key, {
        foremanId: foreman?.employee.id ?? null,
        foremanName: foreman ? `${foreman.employee.first_name} ${foreman.employee.last_name}` : "No Foreman Assigned",
        items: [item],
      });
    }
  }
  return [...groups.values()].sort((a, b) => {
    if (a.foremanId === null) return 1;
    if (b.foremanId === null) return -1;
    return a.foremanName.localeCompare(b.foremanName);
  });
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

/** Item 11's clickable summary counters — Present / Assigned / Not Assigned / Absent / Leave / Sick / Other unavailable (training+off_site), each a distinct, useful filter rather than one blended "unavailable" bucket. */
export type WorkforceStatusCounts = {
  present: number;
  assigned: number;
  notAssigned: number;
  absent: number;
  leave: number;
  sick: number;
  otherUnavailable: number;
};

export function summarizeWorkforceByStatus(workforce: Pick<EmployeeDailyState, "attendanceStatus" | "assignedTeam">[]): WorkforceStatusCounts {
  return {
    present: workforce.filter((state) => state.attendanceStatus === "present").length,
    assigned: workforce.filter((state) => state.assignedTeam !== null).length,
    notAssigned: workforce.filter((state) => dailyAttendancePermitsWork(state.attendanceStatus) && state.assignedTeam === null).length,
    absent: workforce.filter((state) => state.attendanceStatus === "absent").length,
    leave: workforce.filter((state) => state.attendanceStatus === "leave").length,
    sick: workforce.filter((state) => state.attendanceStatus === "sick").length,
    otherUnavailable: workforce.filter((state) => state.attendanceStatus === "training" || state.attendanceStatus === "off_site").length,
  };
}
