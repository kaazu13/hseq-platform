import { describe, it, expect } from "vitest";
import { canManageEmployeeRates } from "./permissions";

/**
 * Part 18/40's rate security matrix — deliberately narrower than most
 * "manage" tiers in this codebase: only company_admin/planner (plus
 * platform_super_admin globally). Project Manager and Operations Manager
 * get NOTHING here even though they manage projects/workforce elsewhere —
 * compensation is private data, not workforce-operational data.
 */
describe("canManageEmployeeRates — Part 18/40's rate security matrix", () => {
  it("allows platform_super_admin regardless of company roles", () => {
    expect(canManageEmployeeRates([], true)).toBe(true);
    expect(canManageEmployeeRates(["employee"], true)).toBe(true);
  });

  it("allows company_admin", () => {
    expect(canManageEmployeeRates(["company_admin"], false)).toBe(true);
  });

  it("allows planner", () => {
    expect(canManageEmployeeRates(["planner"], false)).toBe(true);
  });

  it("denies project_manager", () => {
    expect(canManageEmployeeRates(["project_manager"], false)).toBe(false);
  });

  it("denies operations_manager", () => {
    expect(canManageEmployeeRates(["operations_manager"], false)).toBe(false);
  });

  it("denies hseq_manager, hse_officer, foreman, inspector, recruiter, employee", () => {
    for (const role of ["hseq_manager", "hse_officer", "foreman", "inspector", "recruiter", "employee"] as const) {
      expect(canManageEmployeeRates([role], false)).toBe(false);
    }
  });

  it("denies an empty role set without super-admin", () => {
    expect(canManageEmployeeRates([], false)).toBe(false);
  });
});
