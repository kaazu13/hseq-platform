import { describe, it, expect } from "vitest";
import { isEmployeeOnlyAccount } from "./role-checks";

describe("isEmployeeOnlyAccount (Employee-role correction milestone)", () => {
  it("true for a plain employee with no other role", () => {
    expect(isEmployeeOnlyAccount(["employee"])).toBe(true);
  });

  it("true for zero roles — a bare project member with no company role at all gets the same narrow treatment as employee", () => {
    expect(isEmployeeOnlyAccount([])).toBe(true);
  });

  it("false for every other single role", () => {
    for (const role of ["company_admin", "operations_manager", "project_manager", "hseq_manager", "hse_officer", "foreman", "inspector", "planner", "recruiter", "platform_super_admin"] as const) {
      expect(isEmployeeOnlyAccount([role])).toBe(false);
    }
  });

  it("false for a multi-role account that ALSO holds employee alongside an elevated role — never wrongly narrows a genuinely multi-role account", () => {
    expect(isEmployeeOnlyAccount(["employee", "foreman"])).toBe(false);
    expect(isEmployeeOnlyAccount(["foreman", "employee"])).toBe(false);
  });
});
