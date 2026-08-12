import { describe, it, expect } from "vitest";
import {
  dailyAttendancePermitsWork,
  employeeIsAvailableForAssignment,
  summarizeDailyWorkforce,
  summarizeWorkforceByStatus,
  groupTeamsByForeman,
  DAILY_ATTENDANCE_STATUSES_PERMITTING_WORK,
  DAILY_ATTENDANCE_STATUSES,
} from "./types";
import type { DailyAttendanceStatus, DailyTeamShift, DailyTeamWithMembers, DailyTeamMemberWithEmployee } from "./types";

function state(attendanceStatus: DailyAttendanceStatus, assignedTeam: { id: string; name: string; shift: DailyTeamShift | null } | null = null) {
  return { attendanceStatus, assignedTeam };
}

function foremanMember(id: string, firstName: string): DailyTeamMemberWithEmployee {
  return {
    id: `member-${id}`,
    employee: { id, first_name: firstName, last_name: "Foreman" },
  } as unknown as DailyTeamMemberWithEmployee;
}

function team(id: string, displayOrder: number, foremen: DailyTeamMemberWithEmployee[]): DailyTeamWithMembers {
  return {
    id,
    name: `Team ${id}`,
    display_order: displayOrder,
    foremen,
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

describe("summarizeDailyWorkforce", () => {
  const team = { id: "t1", name: "Team Alpha", shift: null };

  it("classifies present+assigned, present+unassigned, and unavailable correctly", () => {
    const workforce = [
      state("present", team), // assigned
      state("present", null), // not assigned (present, no team)
      state("not_set", null), // not assigned (permits work, no team)
      state("absent", null), // unavailable
      state("sick", team), // unavailable, even though (unrealistically) still on a team
    ];
    const summary = summarizeDailyWorkforce(workforce);
    expect(summary.rosterSize).toBe(5);
    expect(summary.presentCount).toBe(2);
    expect(summary.assignedCount).toBe(2);
    expect(summary.notAssignedCount).toBe(2);
    expect(summary.unavailableCount).toBe(2);
    expect(summary.incompleteAttendanceCount).toBe(1); // the single not_set row
  });

  it("counts attendance never recorded (not_set) as incomplete, distinct from present-but-unassigned", () => {
    const summary = summarizeDailyWorkforce([state("not_set", null), state("present", null)]);
    expect(summary.incompleteAttendanceCount).toBe(1);
    expect(summary.notAssignedCount).toBe(2); // both permit work and have no team
  });

  it("returns all zeros for an empty roster", () => {
    const summary = summarizeDailyWorkforce([]);
    expect(summary).toEqual({ rosterSize: 0, presentCount: 0, unavailableCount: 0, notAssignedCount: 0, assignedCount: 0, incompleteAttendanceCount: 0 });
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

describe("groupTeamsByForeman — item 5/10", () => {
  it("groups teams under their foreman's name, keeping each group's items in the input (display_order) order", () => {
    const karl = foremanMember("karl-1", "Karl");
    const peter = foremanMember("peter-1", "Peter");
    const teams = [
      team("t3", 2, [karl]),
      team("t1", 0, [karl]),
      team("t2", 1, [peter]),
    ];

    const groups = groupTeamsByForeman(teams);

    expect(groups.map((g) => g.foremanName)).toEqual(["Karl Foreman", "Peter Foreman"]);
    const karlGroup = groups.find((g) => g.foremanName === "Karl Foreman")!;
    // Input order preserved — this is where display_order-sorted input stays respected inside the group.
    expect(karlGroup.items.map((t) => t.id)).toEqual(["t3", "t1"]);
  });

  it("teams with no foreman fall back to a 'No Foreman Assigned' group, sorted last", () => {
    const karl = foremanMember("karl-1", "Karl");
    const teams = [team("legacy", 0, []), team("with-foreman", 1, [karl])];

    const groups = groupTeamsByForeman(teams);

    expect(groups.map((g) => g.foremanName)).toEqual(["Karl Foreman", "No Foreman Assigned"]);
    expect(groups.find((g) => g.foremanName === "No Foreman Assigned")!.items.map((t) => t.id)).toEqual(["legacy"]);
  });

  it("a team with more than one foreman groups under the first one only", () => {
    const karl = foremanMember("karl-1", "Karl");
    const peter = foremanMember("peter-1", "Peter");
    const groups = groupTeamsByForeman([team("t1", 0, [karl, peter])]);

    expect(groups).toHaveLength(1);
    expect(groups[0].foremanName).toBe("Karl Foreman");
  });

  it("returns an empty list for no teams", () => {
    expect(groupTeamsByForeman([])).toEqual([]);
  });
});
