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

/** One daily team's workers, resolved to their employee info — mirrors modules/teams/types.ts's TeamWithAssignments split. */
export type DailyTeamMemberWithEmployee = DailyTeamMember & {
  employee: BasicEmployee;
};

/**
 * Milestone G: a team's Foreman is a direct column (`foreman_employee_id`)
 * — decoupled from daily_team_members entirely, so ONE Foreman may run
 * MULTIPLE Today's Teams for the same project/date/shift (the old
 * daily_team_members-row model accidentally capped a Foreman to one team
 * per shift, which was wrong — see the migration's header comment).
 * `foreman` is the resolved employee for display; `null` only for
 * legacy/broken historical rows.
 */
export type DailyTeamWithMembers = DailyTeam & {
  foreman: BasicEmployee | null;
  workers: DailyTeamMemberWithEmployee[];
};

/** One employee on today's Foreman roster (milestone G, item 10) — resolved for display. */
export type DailyTeamForemanRosterEntry = {
  foremanEmployeeId: string;
  employee: BasicEmployee;
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

type ResolvedTeamRef = { id: string; name: string; shift: DailyTeamShift | null };

/**
 * Resolves ONE employee's `assignedTeam` from the two independent sources
 * `listWorkforceForDate` looks up: an open `daily_team_members` row
 * (worker) and/or leading a team as Foreman (`daily_teams.foreman_employee_id`
 * — a direct column, entirely decoupled from `daily_team_members` since
 * milestone G). Extracted as its own pure function so the fix for the
 * "a Foreman running one or more of today's teams was invisible to
 * `assignedTeam` and fell into Not Assigned instead of Assigned to Teams"
 * bug — and the "one Foreman running MULTIPLE teams is still counted
 * exactly once" requirement (item 13) — are independently unit-testable,
 * separate from the live Supabase joins that produce `membership`/
 * `foremanTeam` in the first place. Worker membership wins if both
 * somehow exist (shouldn't normally happen — a Foreman isn't also
 * expected to hold a worker row on their own team) but either source
 * alone is sufficient proof of "assigned."
 */
export function resolveAssignedTeam(membership: ResolvedTeamRef | null, foremanTeam: ResolvedTeamRef | null): ResolvedTeamRef | null {
  return membership ?? foremanTeam ?? null;
}

/** True when an employee's current daily state permits assigning them to a team — mirrors dailyAttendancePermitsWork(), applied to the resolved state rather than a raw status. */
export function employeeIsAvailableForAssignment(state: Pick<EmployeeDailyState, "attendanceStatus">): boolean {
  return dailyAttendancePermitsWork(state.attendanceStatus);
}

export type ForemanGroup<T extends DailyTeamWithMembers> = { foremanId: string | null; foremanName: string; items: T[] };

/**
 * Milestone G, item 3/10: Today's Teams' primary grouping is the
 * project's daily Foreman ROSTER, not derived purely from which teams
 * happen to exist. A roster Foreman with zero teams still gets a heading
 * (with an empty team list) — that is the whole point of "Add Foreman does
 * NOT by itself create a team." `roster` drives which named groups exist
 * (sorted by name); `teams` (already display_order-sorted by the caller)
 * are bucketed by their own `foreman_employee_id`, preserving that order
 * within each group. Any team whose foreman_employee_id doesn't match a
 * roster entry (a legacy/broken row with no foreman, or a foreman removed
 * from the roster in some edge case) falls into a "No Foreman Assigned"
 * group, sorted last — historical/repair-only, since every team created
 * via create_daily_team_for_foreman() requires a rostered Foreman.
 */
export function groupTeamsByForemanRoster<T extends DailyTeamWithMembers>(roster: DailyTeamForemanRosterEntry[], teams: T[]): ForemanGroup<T>[] {
  const groups = new Map<string, ForemanGroup<T>>();
  for (const entry of roster) {
    groups.set(entry.foremanEmployeeId, {
      foremanId: entry.foremanEmployeeId,
      foremanName: `${entry.employee.first_name} ${entry.employee.last_name}`,
      items: [],
    });
  }

  const noForemanGroup: ForemanGroup<T> = { foremanId: null, foremanName: "No Foreman Assigned", items: [] };
  for (const team of teams) {
    const key = team.foreman_employee_id;
    const group = key ? groups.get(key) : undefined;
    if (group) {
      group.items.push(team);
    } else {
      noForemanGroup.items.push(team);
    }
  }

  const sortedGroups = [...groups.values()].sort((a, b) => a.foremanName.localeCompare(b.foremanName));
  return noForemanGroup.items.length > 0 ? [...sortedGroups, noForemanGroup] : sortedGroups;
}

/**
 * The Project Dashboard's Daily Overview counting definitions (redesign —
 * "make the daily overview reconcile logically" requirement). Every
 * category is computed from the SAME per-employee `EmployeeDailyState`
 * array (one entry per roster employee — see `listWorkforceForDate`'s own
 * dedup-by-employee-id contract), so no employee can ever land in two
 * mutually-exclusive buckets and no employee is ever counted twice:
 *
 * - `atWorkCount` — the real "who is actually working today" number. An
 *   employee counts as At Work if their attendance status permits work
 *   AND (they are assigned to a Today's Team — worker OR Foreman — OR
 *   their attendance is explicitly marked `present`). This deliberately
 *   does NOT require a PM to both assign someone to a team AND separately
 *   mark them present — team assignment alone is sufficient evidence of
 *   being at work. An `unavailable` status (absent/sick/leave/etc.)
 *   always excludes an employee from At Work, even if a stale team
 *   assignment still exists.
 * - `assignedCount` — assigned to a Today's Team, worker or Foreman,
 *   today. `EmployeeDailyState.assignedTeam` is resolved once per
 *   employee (never once per team-row), so a Foreman running multiple
 *   teams the same day is still counted exactly once here.
 * - `notAssignedCount` — attendance permits work, but no team assignment
 *   (worker or Foreman) exists yet. Mutually exclusive with `assignedCount`
 *   by construction (`assignedTeam === null`).
 * - `unavailableCount` — attendance status does not permit work (absent,
 *   sick, leave, training, off_site). Mutually exclusive with both
 *   `assignedCount`/`notAssignedCount`'s "permits work" branch.
 * - `incompleteAttendanceCount` — attendance was never recorded at all
 *   for this date (`not_set`) — a subset of whichever of the above
 *   buckets `not_set` (a permits-work status) falls into, tracked
 *   separately as its own action-required signal.
 */
export type DailyWorkforceSummary = {
  rosterSize: number;
  atWorkCount: number;
  unavailableCount: number;
  notAssignedCount: number;
  assignedCount: number;
  incompleteAttendanceCount: number;
};

/** Aggregates a day's full roster into the PM Daily Overview's "Today" counts — the single source both the overview cards and (if ever needed elsewhere) any other daily-workforce summary should derive from, rather than re-deriving these filters ad hoc per caller. See `DailyWorkforceSummary`'s own doc comment for the exact definition of each count. */
export function summarizeDailyWorkforce(workforce: Pick<EmployeeDailyState, "attendanceStatus" | "assignedTeam">[]): DailyWorkforceSummary {
  return {
    rosterSize: workforce.length,
    atWorkCount: workforce.filter((state) => dailyAttendancePermitsWork(state.attendanceStatus) && (state.assignedTeam !== null || state.attendanceStatus === "present")).length,
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
