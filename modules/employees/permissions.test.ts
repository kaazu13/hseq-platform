import { describe, it, expect } from "vitest";
import {
  canManageEmployees,
  canViewEmployeeDirectory,
  canManageEmployeeRoles,
  canManageEmploymentLifecycle,
  assignableRoleNamesFor,
  isAssignableAsOrdinaryWorker,
} from "./permissions";

describe("canManageEmployees", () => {
  it("allows company_admin", () => {
    expect(canManageEmployees(["company_admin"])).toBe(true);
  });

  it("allows operations_manager", () => {
    expect(canManageEmployees(["operations_manager"])).toBe(true);
  });

  it("denies every other single role", () => {
    expect(canManageEmployees(["hseq_manager"])).toBe(false);
    expect(canManageEmployees(["project_manager"])).toBe(false);
    expect(canManageEmployees(["hse_officer"])).toBe(false);
    expect(canManageEmployees(["foreman"])).toBe(false);
    expect(canManageEmployees(["inspector"])).toBe(false);
    expect(canManageEmployees(["recruiter"])).toBe(false);
    expect(canManageEmployees(["planner"])).toBe(false);
    expect(canManageEmployees(["employee"])).toBe(false);
  });

  it("denies an empty role set", () => {
    expect(canManageEmployees([])).toBe(false);
  });

  it("allows a union that includes a write role among others", () => {
    expect(canManageEmployees(["inspector", "operations_manager"])).toBe(true);
  });
});

describe("canViewEmployeeDirectory", () => {
  it("allows every documented read role", () => {
    for (const role of ["company_admin", "operations_manager", "hseq_manager", "project_manager", "inspector", "planner"] as const) {
      expect(canViewEmployeeDirectory([role])).toBe(true);
    }
  });

  it("deliberately excludes hse_officer, foreman, and recruiter (project-scoped, not company-wide, per the Role Catalogue milestone)", () => {
    expect(canViewEmployeeDirectory(["hse_officer"])).toBe(false);
    expect(canViewEmployeeDirectory(["foreman"])).toBe(false);
    expect(canViewEmployeeDirectory(["recruiter"])).toBe(false);
  });

  it("excludes plain employee", () => {
    expect(canViewEmployeeDirectory(["employee"])).toBe(false);
  });
});

describe("canManageEmployeeRoles / canManageEmploymentLifecycle (same gate as canManageEmployees)", () => {
  it("mirror canManageEmployees exactly", () => {
    for (const roles of [["company_admin"], ["operations_manager"], ["hseq_manager"], []]) {
      const expected = canManageEmployees(roles as never);
      expect(canManageEmployeeRoles(roles as never)).toBe(expected);
      expect(canManageEmploymentLifecycle(roles as never)).toBe(expected);
    }
  });
});

describe("assignableRoleNamesFor", () => {
  const allRoles = [
    "platform_super_admin",
    "company_admin",
    "operations_manager",
    "project_manager",
    "hseq_manager",
    "hse_officer",
    "foreman",
    "inspector",
    "recruiter",
    "planner",
    "employee",
  ] as const;

  it("never allows platform_super_admin, for anyone", () => {
    expect(assignableRoleNamesFor(["company_admin"], [...allRoles])).not.toContain("platform_super_admin");
    expect(assignableRoleNamesFor(["operations_manager"], [...allRoles])).not.toContain("platform_super_admin");
  });

  it("a company_admin may assign every other role", () => {
    const assignable = assignableRoleNamesFor(["company_admin"], [...allRoles]);
    expect(assignable.sort()).toEqual([...allRoles].filter((r) => r !== "platform_super_admin").sort());
  });

  it("an operations_manager (without company_admin) may not assign the forbidden elevated/specialist roles", () => {
    const assignable = assignableRoleNamesFor(["operations_manager"], [...allRoles]);
    for (const forbidden of ["company_admin", "project_manager", "hseq_manager", "hse_officer", "foreman", "recruiter"]) {
      expect(assignable).not.toContain(forbidden);
    }
  });

  it("an operations_manager may still assign operations_manager, inspector, planner, and employee", () => {
    const assignable = assignableRoleNamesFor(["operations_manager"], [...allRoles]);
    expect(assignable).toEqual(expect.arrayContaining(["operations_manager", "inspector", "planner", "employee"]));
  });

  it("union rule: holding both company_admin and operations_manager gets the unrestricted allowance", () => {
    const assignable = assignableRoleNamesFor(["operations_manager", "company_admin"], [...allRoles]);
    expect(assignable).toContain("hseq_manager");
    expect(assignable).toContain("foreman");
  });

  it("a caller with no relevant roles gets the operations_manager-shaped restriction (not company_admin's)", () => {
    const assignable = assignableRoleNamesFor(["employee"], [...allRoles]);
    expect(assignable).not.toContain("company_admin");
    expect(assignable).toContain("planner");
  });
});

describe("isAssignableAsOrdinaryWorker — Part 9's management self-participation rule", () => {
  it("blocks an account holding ONLY management-only roles", () => {
    expect(isAssignableAsOrdinaryWorker(["platform_super_admin"])).toBe(false);
    expect(isAssignableAsOrdinaryWorker(["company_admin"])).toBe(false);
    expect(isAssignableAsOrdinaryWorker(["project_manager"])).toBe(false);
    expect(isAssignableAsOrdinaryWorker(["planner"])).toBe(false);
  });

  it("blocks a combination of multiple management-only roles", () => {
    expect(isAssignableAsOrdinaryWorker(["company_admin", "planner"])).toBe(false);
  });

  it("allows an ordinary operational role", () => {
    expect(isAssignableAsOrdinaryWorker(["employee"])).toBe(true);
    expect(isAssignableAsOrdinaryWorker(["foreman"])).toBe(true);
    expect(isAssignableAsOrdinaryWorker(["inspector"])).toBe(true);
    expect(isAssignableAsOrdinaryWorker(["hse_officer"])).toBe(true);
    expect(isAssignableAsOrdinaryWorker(["hseq_manager"])).toBe(true);
    expect(isAssignableAsOrdinaryWorker(["operations_manager"])).toBe(true);
    expect(isAssignableAsOrdinaryWorker(["recruiter"])).toBe(true);
  });

  it("allows a genuine multi-role account holding a management role ALONGSIDE an operational one (never wrongly narrowed)", () => {
    expect(isAssignableAsOrdinaryWorker(["project_manager", "foreman"])).toBe(true);
    expect(isAssignableAsOrdinaryWorker(["company_admin", "employee"])).toBe(true);
  });

  it("treats an account with no roles at all as assignable (not blocked by this rule — other eligibility checks apply)", () => {
    expect(isAssignableAsOrdinaryWorker([])).toBe(true);
  });
});
