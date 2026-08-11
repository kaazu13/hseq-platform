import { describe, it, expect } from "vitest";
import { dailyAttendancePermitsWork, employeeIsAvailableForAssignment, summarizeDailyWorkforce, DAILY_ATTENDANCE_STATUSES_PERMITTING_WORK, DAILY_ATTENDANCE_STATUSES } from "./types";
import type { DailyAttendanceStatus } from "./types";

function state(attendanceStatus: DailyAttendanceStatus, assignedTeam: { id: string; name: string; shift: string | null } | null = null) {
  return { attendanceStatus, assignedTeam };
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
