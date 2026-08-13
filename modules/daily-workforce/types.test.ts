import { describe, it, expect } from "vitest";
import {
  dailyAttendancePermitsWork,
  employeeIsAvailableForAssignment,
  summarizeDailyWorkforce,
  summarizeWorkforceByStatus,
  groupTeamsByForemanRoster,
  resolveAssignedTeam,
  DAILY_ATTENDANCE_STATUSES_PERMITTING_WORK,
  DAILY_ATTENDANCE_STATUSES,
} from "./types";
import type { DailyAttendanceStatus, DailyTeamShift, DailyTeamWithMembers, DailyTeamForemanRosterEntry, BasicEmployee } from "./types";

function state(attendanceStatus: DailyAttendanceStatus, assignedTeam: { id: string; name: string; shift: DailyTeamShift | null } | null = null) {
  return { attendanceStatus, assignedTeam };
}

function foremanEmployee(id: string, firstName: string): BasicEmployee {
  return { id, first_name: firstName, last_name: "Foreman" } as unknown as BasicEmployee;
}

function rosterEntry(id: string, firstName: string): DailyTeamForemanRosterEntry {
  return { foremanEmployeeId: id, employee: foremanEmployee(id, firstName) };
}

function team(id: string, displayOrder: number, foremanEmployeeId: string | null): DailyTeamWithMembers {
  return {
    id,
    name: `Team ${id}`,
    display_order: displayOrder,
    foreman_employee_id: foremanEmployeeId,
    foreman: foremanEmployeeId ? foremanEmployee(foremanEmployeeId, "Ignored") : null,
    workers: [],
  } as unknown as DailyTeamWithMembers;
}

describe("dailyAttendancePermitsWork", () => {
  it("permits work for not_set and present — matches daily_attendance_permits_work() in the migration", () => {
    expect(dailyAttendancePermitsWork("not_set")).toBe(true);
    expect(dailyAttendancePermitsWork("present")).toBe(true);
  });

  it("blocks work for every other status", () => {
    for (const status of DAILY_ATTENDANCE_STATUSES) {
      if (DAILY_ATTENDANCE_STATUSES_PERMITTING_WORK.includes(status)) continue;
      expect(dailyAttendancePermitsWork(status)).toBe(false);
    }
  });

  it("covers every declared status — no status is silently unaccounted for", () => {
    for (const status of DAILY_ATTENDANCE_STATUSES) {
      expect(typeof dailyAttendancePermitsWork(status)).toBe("boolean");
    }
  });
});

describe("employeeIsAvailableForAssignment", () => {
  it("mirrors dailyAttendancePermitsWork applied to a resolved EmployeeDailyState", () => {
    expect(employeeIsAvailableForAssignment({ attendanceStatus: "present" })).toBe(true);
    expect(employeeIsAvailableForAssignment({ attendanceStatus: "not_set" })).toBe(true);
    expect(employeeIsAvailableForAssignment({ attendanceStatus: "absent" })).toBe(false);
    expect(employeeIsAvailableForAssignment({ attendanceStatus: "sick" })).toBe(false);
    expect(employeeIsAvailableForAssignment({ attendanceStatus: "leave" })).toBe(false);
    expect(employeeIsAvailableForAssignment({ attendanceStatus: "training" })).toBe(false);
    expect(employeeIsAvailableForAssignment({ attendanceStatus: "off_site" })).toBe(false);
  });
});

describe("summarizeDailyWorkforce — Project Dashboard Daily Overview redesign", () => {
  const team = { id: "t1", name: "Team Alpha", shift: null };

  it("classifies present+assigned, present+unassigned, and unavailable correctly", () => {
    const workforce = [
      state("present", team), // assigned, at work
      state("present", null), // not assigned, at work (present alone is sufficient)
      state("not_set", null), // not assigned (permits work, no team)
      state("absent", null), // unavailable
      state("sick", team), // unavailable, even though (unrealistically) still on a team
    ];
    const summary = summarizeDailyWorkforce(workforce);
    expect(summary.rosterSize).toBe(5);
    expect(summary.atWorkCount).toBe(2);
    expect(summary.assignedCount).toBe(2);
    expect(summary.notAssignedCount).toBe(2);
    expect(summary.unavailableCount).toBe(2);
    expect(summary.incompleteAttendanceCount).toBe(1); // the single not_set row
  });

  it("'At Work' counts an employee assigned to a team even when NOT explicitly marked present — a PM should not have to both assign AND mark present", () => {
    const summary = summarizeDailyWorkforce([state("not_set", team)]);
    expect(summary.atWorkCount).toBe(1);
    expect(summary.assignedCount).toBe(1);
  });

  it("'At Work' counts an employee marked present even with no team assignment", () => {
    const summary = summarizeDailyWorkforce([state("present", null)]);
    expect(summary.atWorkCount).toBe(1);
    expect(summary.assignedCount).toBe(0);
  });

  it("'At Work' NEVER counts an unavailable employee, even with a (stale) team assignment", () => {
    const summary = summarizeDailyWorkforce([state("absent", team), state("sick", team), state("leave", team)]);
    expect(summary.atWorkCount).toBe(0);
    expect(summary.assignedCount).toBe(3); // assignedCount is purely "has a team", independent of At Work
  });

  it("assignedCount and notAssignedCount are mutually exclusive and reconcile with rosterSize among permits-work employees", () => {
    const workforce = [state("present", team), state("not_set", team), state("present", null), state("not_set", null), state("absent", null)];
    const summary = summarizeDailyWorkforce(workforce);
    const permitsWorkCount = summary.rosterSize - summary.unavailableCount;
    expect(summary.assignedCount + summary.notAssignedCount).toBe(permitsWorkCount);
  });

  it("counts attendance never recorded (not_set) as incomplete, distinct from present-but-unassigned", () => {
    const summary = summarizeDailyWorkforce([state("not_set", null), state("present", null)]);
    expect(summary.incompleteAttendanceCount).toBe(1);
    expect(summary.notAssignedCount).toBe(2); // both permit work and have no team
  });

  it("returns all zeros for an empty roster", () => {
    const summary = summarizeDailyWorkforce([]);
    expect(summary).toEqual({ rosterSize: 0, atWorkCount: 0, unavailableCount: 0, notAssignedCount: 0, assignedCount: 0, incompleteAttendanceCount: 0 });
  });
});

describe("summarizeWorkforceByStatus — item 11's clickable summary counters", () => {
  it("breaks out absent/leave/sick/other-unavailable into distinct counts, never one blended 'unavailable' bucket", () => {
    const team = { id: "t1", name: "Team Alpha", shift: null };
    const counts = summarizeWorkforceByStatus([
      state("present", team),
      state("present", null),
      state("absent", null),
      state("leave", null),
      state("sick", null),
      state("training", null),
      state("off_site", null),
    ]);
    expect(counts).toEqual({ present: 2, assigned: 1, notAssigned: 1, absent: 1, leave: 1, sick: 1, otherUnavailable: 2 });
  });

  it("returns all zeros for an empty roster", () => {
    expect(summarizeWorkforceByStatus([])).toEqual({ present: 0, assigned: 0, notAssigned: 0, absent: 0, leave: 0, sick: 0, otherUnavailable: 0 });
  });
});

describe("resolveAssignedTeam — the Foreman-under-count fix (item 13)", () => {
  const workerTeam = { id: "w1", name: "Worker's Team", shift: null };
  const foremanTeam = { id: "f1", name: "Foreman's Team", shift: null };

  it("returns the worker membership team when it exists", () => {
    expect(resolveAssignedTeam(workerTeam, null)).toEqual(workerTeam);
  });

  it("returns the Foreman's led team when there is no worker membership — this is the bug fix: a Foreman running a team was previously always null here", () => {
    expect(resolveAssignedTeam(null, foremanTeam)).toEqual(foremanTeam);
  });

  it("prefers worker membership over Foreman leadership if both somehow exist", () => {
    expect(resolveAssignedTeam(workerTeam, foremanTeam)).toEqual(workerTeam);
  });

  it("returns null when neither source has a team — genuinely not assigned", () => {
    expect(resolveAssignedTeam(null, null)).toBeNull();
  });

  it("a Foreman leading MULTIPLE teams the same day still resolves to exactly one non-null assignedTeam — never double-counted downstream by summarizeDailyWorkforce's per-employee filter", () => {
    // listWorkforceForDate's foremanTeamByEmployeeId map keeps only the
    // FIRST team found per foreman id — resolveAssignedTeam only ever
    // receives one candidate team either way, so there is no code path
    // that could produce two assignedTeam entries for one employee.
    const firstTeam = resolveAssignedTeam(null, foremanTeam);
    const summary = summarizeDailyWorkforce([{ attendanceStatus: "present", assignedTeam: firstTeam }]);
    expect(summary.assignedCount).toBe(1);
    expect(summary.atWorkCount).toBe(1);
  });
});

describe("groupTeamsByForemanRoster — milestone G, items 3/10", () => {
  it("groups teams under their foreman's name (via foreman_employee_id), keeping each group's items in the input (display_order) order", () => {
    const roster = [rosterEntry("karl-1", "Karl"), rosterEntry("peter-1", "Peter")];
    const teams = [team("t3", 2, "karl-1"), team("t1", 0, "karl-1"), team("t2", 1, "peter-1")];

    const groups = groupTeamsByForemanRoster(roster, teams);

    expect(groups.map((g) => g.foremanName)).toEqual(["Karl Foreman", "Peter Foreman"]);
    const karlGroup = groups.find((g) => g.foremanName === "Karl Foreman")!;
    // Input order preserved — this is where display_order-sorted input stays respected inside the group.
    expect(karlGroup.items.map((t) => t.id)).toEqual(["t3", "t1"]);
  });

  it("a roster foreman with zero teams still gets a heading, with an empty item list — the whole point of 'Add Foreman does not by itself create a team'", () => {
    const roster = [rosterEntry("karl-1", "Karl"), rosterEntry("peter-1", "Peter")];
    const groups = groupTeamsByForemanRoster(roster, [team("t1", 0, "karl-1")]);

    expect(groups.map((g) => g.foremanName)).toEqual(["Karl Foreman", "Peter Foreman"]);
    const peterGroup = groups.find((g) => g.foremanName === "Peter Foreman")!;
    expect(peterGroup.items).toEqual([]);
  });

  it("one foreman may have MULTIPLE teams in the same group", () => {
    const roster = [rosterEntry("karl-1", "Karl")];
    const groups = groupTeamsByForemanRoster(roster, [team("t1", 0, "karl-1"), team("t3", 1, "karl-1"), team("t4", 2, "karl-1")]);

    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((t) => t.id)).toEqual(["t1", "t3", "t4"]);
  });

  it("teams with no foreman (legacy/broken) fall back to a 'No Foreman Assigned' group, sorted last", () => {
    const roster = [rosterEntry("karl-1", "Karl")];
    const teams = [team("legacy", 0, null), team("with-foreman", 1, "karl-1")];

    const groups = groupTeamsByForemanRoster(roster, teams);

    expect(groups.map((g) => g.foremanName)).toEqual(["Karl Foreman", "No Foreman Assigned"]);
    expect(groups.find((g) => g.foremanName === "No Foreman Assigned")!.items.map((t) => t.id)).toEqual(["legacy"]);
  });

  it("omits the 'No Foreman Assigned' group entirely when every team has a foreman", () => {
    const roster = [rosterEntry("karl-1", "Karl")];
    const groups = groupTeamsByForemanRoster(roster, [team("t1", 0, "karl-1")]);
    expect(groups.some((g) => g.foremanName === "No Foreman Assigned")).toBe(false);
  });

  it("returns an empty list for no roster and no teams", () => {
    expect(groupTeamsByForemanRoster([], [])).toEqual([]);
  });
});
