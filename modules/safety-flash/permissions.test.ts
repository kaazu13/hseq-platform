import { describe, it, expect } from "vitest";
import { canManageSafetyFlash } from "./permissions";

describe("canManageSafetyFlash", () => {
  it("hseq_manager can always manage, project or no project", () => {
    expect(canManageSafetyFlash(["hseq_manager"], "project-1", false)).toBe(true);
    expect(canManageSafetyFlash(["hseq_manager"], null, false)).toBe(true);
  });

  it("hse_officer can manage a project-scoped flash only with project access", () => {
    expect(canManageSafetyFlash(["hse_officer"], "project-1", true)).toBe(true);
    expect(canManageSafetyFlash(["hse_officer"], "project-1", false)).toBe(false);
  });

  it("hse_officer can manage an company-wide flash (no project) without any project access at all", () => {
    expect(canManageSafetyFlash(["hse_officer"], null, false)).toBe(true);
  });

  it("foreman/project_manager/inspector/employee/company_admin cannot manage, even company-wide", () => {
    for (const role of ["foreman", "project_manager", "inspector", "employee", "company_admin"] as const) {
      expect(canManageSafetyFlash([role], null, false)).toBe(false);
      expect(canManageSafetyFlash([role], "project-1", true)).toBe(false);
    }
  });
});
