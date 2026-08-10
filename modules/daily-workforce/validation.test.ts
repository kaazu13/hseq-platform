import { describe, it, expect } from "vitest";
import { setDailyAttendanceStatusSchema, dailyTeamFormSchema, moveDailyTeamMemberSchema, unlockDailyTeamsSchema } from "./validation";

describe("setDailyAttendanceStatusSchema", () => {
  it("accepts every one of the 7 controlled statuses", () => {
    for (const status of ["not_set", "present", "absent", "sick", "leave", "training", "off_site"]) {
      expect(setDailyAttendanceStatusSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it("rejects a status outside the controlled list", () => {
    expect(setDailyAttendanceStatusSchema.safeParse({ status: "on_leave" }).success).toBe(false);
  });

  it("allows note to be omitted", () => {
    expect(setDailyAttendanceStatusSchema.safeParse({ status: "present" }).success).toBe(true);
  });
});

describe("dailyTeamFormSchema", () => {
  const VALID = { name: "Team A200", shift: "Day Shift", workArea: "A200", activity: "Scaffold Assembly" };

  it("accepts a fully populated valid input", () => {
    expect(dailyTeamFormSchema.safeParse(VALID).success).toBe(true);
  });

  it("requires a non-blank name", () => {
    expect(dailyTeamFormSchema.safeParse({ ...VALID, name: "" }).success).toBe(false);
    expect(dailyTeamFormSchema.safeParse({ ...VALID, name: "   " }).success).toBe(false);
  });

  it("allows shift/workArea/activity to be omitted", () => {
    expect(dailyTeamFormSchema.safeParse({ name: "Team A200" }).success).toBe(true);
  });
});

describe("moveDailyTeamMemberSchema", () => {
  const EMPLOYEE_ID = "123e4567-e89b-42d3-a456-426614174000";
  const TEAM_ID = "123e4567-e89b-42d3-a456-426614174001";

  it("accepts a valid member move", () => {
    expect(moveDailyTeamMemberSchema.safeParse({ employeeId: EMPLOYEE_ID, dailyTeamId: TEAM_ID, role: "member" }).success).toBe(true);
  });

  it("accepts role=foreman", () => {
    expect(moveDailyTeamMemberSchema.safeParse({ employeeId: EMPLOYEE_ID, dailyTeamId: TEAM_ID, role: "foreman" }).success).toBe(true);
  });

  it("rejects a role outside member/foreman", () => {
    expect(moveDailyTeamMemberSchema.safeParse({ employeeId: EMPLOYEE_ID, dailyTeamId: TEAM_ID, role: "supervisor" }).success).toBe(false);
  });

  it("rejects non-uuid employeeId/dailyTeamId", () => {
    expect(moveDailyTeamMemberSchema.safeParse({ employeeId: "not-a-uuid", dailyTeamId: TEAM_ID, role: "member" }).success).toBe(false);
    expect(moveDailyTeamMemberSchema.safeParse({ employeeId: EMPLOYEE_ID, dailyTeamId: "not-a-uuid", role: "member" }).success).toBe(false);
  });
});

describe("unlockDailyTeamsSchema", () => {
  it("requires a non-blank reason — audit trail requirement", () => {
    expect(unlockDailyTeamsSchema.safeParse({ reason: "Foreman reported a data entry error" }).success).toBe(true);
    expect(unlockDailyTeamsSchema.safeParse({ reason: "" }).success).toBe(false);
    expect(unlockDailyTeamsSchema.safeParse({ reason: "   " }).success).toBe(false);
  });

  it("rejects a missing reason field entirely", () => {
    expect(unlockDailyTeamsSchema.safeParse({}).success).toBe(false);
  });
});
