import { describe, it, expect } from "vitest";
import { canManageToolboxMeeting } from "./permissions";
import type { RoleName } from "@/modules/companies/types";

describe("canManageToolboxMeeting", () => {
  it("hseq_manager can always manage, even without project access", () => {
    expect(canManageToolboxMeeting(["hseq_manager"], false)).toBe(true);
    expect(canManageToolboxMeeting(["hseq_manager"], true)).toBe(true);
  });

  it("hse_officer can manage only with project access", () => {
    expect(canManageToolboxMeeting(["hse_officer"], true)).toBe(true);
    expect(canManageToolboxMeeting(["hse_officer"], false)).toBe(false);
  });

  it("foreman/project_manager/inspector/employee/company_admin are view-only — no manage tier at all", () => {
    const denied: RoleName[][] = [["foreman"], ["project_manager"], ["inspector"], ["employee"], ["company_admin"], ["operations_manager"]];
    for (const roles of denied) {
      expect(canManageToolboxMeeting(roles, true)).toBe(false);
    }
  });

  it("no roles denies", () => {
    expect(canManageToolboxMeeting([], true)).toBe(false);
  });
});
