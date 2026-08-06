import { describe, it, expect } from "vitest";
import { canAdministerCompany } from "./permissions";

describe("canAdministerCompany", () => {
  it("company_admin and operations_manager can administer", () => {
    expect(canAdministerCompany(["company_admin"])).toBe(true);
    expect(canAdministerCompany(["operations_manager"])).toBe(true);
  });

  it("every other role is denied, including hseq_manager", () => {
    for (const role of ["hseq_manager", "hse_officer", "project_manager", "foreman", "inspector", "employee", "recruiter", "planner"] as const) {
      expect(canAdministerCompany([role])).toBe(false);
    }
  });

  it("no roles denies", () => {
    expect(canAdministerCompany([])).toBe(false);
  });

  it("union rule: holding both an eligible and ineligible role still grants access", () => {
    expect(canAdministerCompany(["employee", "operations_manager"])).toBe(true);
  });
});
