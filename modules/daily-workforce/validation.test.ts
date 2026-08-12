import { describe, it, expect } from "vitest";
import { setDailyAttendanceStatusSchema, dailyTeamFormSchema, createDailyTeamSchema, updateDailyTeamSchema, reorderDailyTeamsSchema, moveDailyTeamMemberSchema, unlockDailyTeamsSchema } from "./validation";

describe("setDailyAttendanceStatusSchema", () => {
  it("accepts every one of the 7 controlled statuses", () => {
    for (const status of ["not_set", "present", "absent", "sick", "leave", "training", "off_site"]) {
      expect(setDailyAttendanceStatusSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it("rejects a status outside the controlled list", () => {
    expect(setDailyAttendanceStatusSchema.safeParse({ status: "on_leave" }).success).toBe(false);
  });

  it("allows note/reason to be omitted", () => {
    expect(setDailyAttendanceStatusSchema.safeParse({ status: "present" }).success).toBe(true);
  });
});

describe("dailyTeamFormSchema", () => {
  const VALID = { name: "Team A200", shift: "day", workArea: "A200", activity: "Scaffold Assembly" };

  it("accepts a fully populated valid input", () => {
    expect(dailyTeamFormSchema.safeParse(VALID).success).toBe(true);
  });

  it("requires a non-blank name", () => {
    expect(dailyTeamFormSchema.safeParse({ ...VALID, name: "" }).success).toBe(false);
    expect(dailyTeamFormSchema.safeParse({ ...VALID, name: "   " }).success).toBe(false);
  });

  it("allows shift/workArea/activity to be omitted — the edit path never forces a shift on a legacy team", () => {
    expect(dailyTeamFormSchema.safeParse({ name: "Team A200" }).success).toBe(true);
  });

  it("rejects a shift outside the controlled day/night/late values", () => {
    expect(dailyTeamFormSchema.safeParse({ ...VALID, shift: "Day Shift" }).success).toBe(false);
  });
});

describe("createDailyTeamSchema — item 9: name, shift, and foreman are all required", () => {
  const FOREMAN_ID = "123e4567-e89b-42d3-a456-426614174002";
  const VALID = { name: "Team A200", shift: "day", foremanEmployeeId: FOREMAN_ID, workArea: "A200", activity: "Scaffold Assembly" };

  it("accepts a fully populated valid input", () => {
    expect(createDailyTeamSchema.safeParse(VALID).success).toBe(true);
  });

  it("accepts with workArea/activity omitted", () => {
    expect(createDailyTeamSchema.safeParse({ name: "Team A200", shift: "day", foremanEmployeeId: FOREMAN_ID }).success).toBe(true);
  });

  it("rejects a missing shift", () => {
    expect(createDailyTeamSchema.safeParse({ name: "Team A200", foremanEmployeeId: FOREMAN_ID }).success).toBe(false);
  });

  it("rejects a missing foreman", () => {
    expect(createDailyTeamSchema.safeParse({ name: "Team A200", shift: "day" }).success).toBe(false);
  });

  it("rejects a non-uuid foremanEmployeeId", () => {
    expect(createDailyTeamSchema.safeParse({ ...VALID, foremanEmployeeId: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects a blank name", () => {
    expect(createDailyTeamSchema.safeParse({ ...VALID, name: "" }).success).toBe(false);
  });
});

describe("updateDailyTeamSchema — item 1: the Edit Team dialog's fields", () => {
  const FOREMAN_ID = "123e4567-e89b-42d3-a456-426614174002";
  const VALID = { name: "Team A200", shift: "day", foremanEmployeeId: FOREMAN_ID, workArea: "A200", activity: "Scaffold Assembly" };

  it("accepts a fully populated valid input", () => {
    expect(updateDailyTeamSchema.safeParse(VALID).success).toBe(true);
  });

  it("accepts a null foremanEmployeeId — 'leave foreman assignment untouched'", () => {
    expect(updateDailyTeamSchema.safeParse({ ...VALID, foremanEmployeeId: null }).success).toBe(true);
  });

  it("rejects a missing foremanEmployeeId key entirely — must be explicitly null, not omitted", () => {
    const withoutForeman: Record<string, unknown> = { ...VALID };
    delete withoutForeman.foremanEmployeeId;
    expect(updateDailyTeamSchema.safeParse(withoutForeman).success).toBe(false);
  });

  it("rejects a missing shift — unlike dailyTeamFormSchema, the edit dialog always has a shift selected", () => {
    const withoutShift: Record<string, unknown> = { ...VALID };
    delete withoutShift.shift;
    expect(updateDailyTeamSchema.safeParse(withoutShift).success).toBe(false);
  });

  it("rejects a blank name", () => {
    expect(updateDailyTeamSchema.safeParse({ ...VALID, name: "" }).success).toBe(false);
  });

  it("rejects a non-uuid foremanEmployeeId", () => {
    expect(updateDailyTeamSchema.safeParse({ ...VALID, foremanEmployeeId: "not-a-uuid" }).success).toBe(false);
  });
});

describe("reorderDailyTeamsSchema", () => {
  it("accepts a non-empty list of team ids", () => {
    expect(reorderDailyTeamsSchema.safeParse({ orderedTeamIds: ["123e4567-e89b-42d3-a456-426614174000"] }).success).toBe(true);
  });

  it("rejects an empty list", () => {
    expect(reorderDailyTeamsSchema.safeParse({ orderedTeamIds: [] }).success).toBe(false);
  });

  it("rejects a non-uuid entry", () => {
    expect(reorderDailyTeamsSchema.safeParse({ orderedTeamIds: ["not-a-uuid"] }).success).toBe(false);
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
