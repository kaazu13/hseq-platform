import { describe, it, expect } from "vitest";
import { teamFormSchema, setTeamAssignmentSchema } from "./validation";

const VALID_TEAM_INPUT = {
  name: "Team Alpha",
  code: "NPE-A",
  color: "blue" as const,
  description: "",
  status: "active" as const,
  shift: "",
  workArea: "",
  activeFrom: "",
  activeUntil: "",
};

describe("teamFormSchema", () => {
  it("accepts a minimal input with every optional field blank", () => {
    expect(teamFormSchema.safeParse(VALID_TEAM_INPUT).success).toBe(true);
  });

  it("rejects a blank team name", () => {
    expect(teamFormSchema.safeParse({ ...VALID_TEAM_INPUT, name: "  " }).success).toBe(false);
  });

  it("accepts shift, work area, and a valid active date range together", () => {
    const result = teamFormSchema.safeParse({ ...VALID_TEAM_INPUT, shift: "Day", workArea: "North wing", activeFrom: "2026-08-12", activeUntil: "2026-09-30" });
    expect(result.success).toBe(true);
  });

  it("accepts activeFrom or activeUntil independently — an open-ended range", () => {
    expect(teamFormSchema.safeParse({ ...VALID_TEAM_INPUT, activeFrom: "2026-08-12", activeUntil: "" }).success).toBe(true);
    expect(teamFormSchema.safeParse({ ...VALID_TEAM_INPUT, activeFrom: "", activeUntil: "2026-09-30" }).success).toBe(true);
  });

  it("accepts activeFrom equal to activeUntil — a single-day range", () => {
    expect(teamFormSchema.safeParse({ ...VALID_TEAM_INPUT, activeFrom: "2026-08-12", activeUntil: "2026-08-12" }).success).toBe(true);
  });

  it("rejects activeUntil before activeFrom", () => {
    const result = teamFormSchema.safeParse({ ...VALID_TEAM_INPUT, activeFrom: "2026-09-30", activeUntil: "2026-08-12" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("activeUntil"))).toBe(true);
    }
  });
});

describe("setTeamAssignmentSchema", () => {
  it("accepts member and foreman roles", () => {
    expect(setTeamAssignmentSchema.safeParse({ employeeId: "123e4567-e89b-42d3-a456-426614174000", role: "member" }).success).toBe(true);
    expect(setTeamAssignmentSchema.safeParse({ employeeId: "123e4567-e89b-42d3-a456-426614174000", role: "foreman" }).success).toBe(true);
  });

  it("rejects a role outside the fixed list", () => {
    expect(setTeamAssignmentSchema.safeParse({ employeeId: "123e4567-e89b-42d3-a456-426614174000", role: "none" }).success).toBe(false);
  });
});
