import { describe, it, expect } from "vitest";
import { dailyAttendancePermitsWork, employeeIsAvailableForAssignment, DAILY_ATTENDANCE_STATUSES_PERMITTING_WORK, DAILY_ATTENDANCE_STATUSES } from "./types";

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
