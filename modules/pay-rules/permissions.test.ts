import { describe, it, expect } from "vitest";
import { canManagePayRules, canReadPayRules, canViewAnyLaborCost, canViewProjectLaborCostOnly } from "./permissions";
import type { RoleName } from "@/modules/companies/types";

describe("canManagePayRules", () => {
  it("grants company_admin and planner", () => {
    expect(canManagePayRules(["company_admin"], false)).toBe(true);
    expect(canManagePayRules(["planner"], false)).toBe(true);
  });

  it("grants platform_super_admin globally", () => {
    expect(canManagePayRules([], true)).toBe(true);
  });

  it("denies project_manager/operations_manager and every operational role", () => {
    expect(canManagePayRules(["project_manager"], false)).toBe(false);
    expect(canManagePayRules(["operations_manager"], false)).toBe(false);
    expect(canManagePayRules(["foreman"], false)).toBe(false);
    expect(canManagePayRules(["employee" as RoleName], false)).toBe(false);
  });
});

describe("canReadPayRules", () => {
  it("includes every manage-tier role (read implied by manage)", () => {
    expect(canReadPayRules(["company_admin"], false, [])).toBe(true);
  });

  it("grants the project's own project_manager read-only access", () => {
    expect(canReadPayRules(["project_manager" as RoleName], false, ["project_manager"])).toBe(true);
  });

  it("denies a project_manager role-holder who isn't assigned as PM on THIS project", () => {
    expect(canReadPayRules(["project_manager" as RoleName], false, [])).toBe(false);
  });

  it("denies operations_manager and plain employee", () => {
    expect(canReadPayRules(["operations_manager"], false, [])).toBe(false);
    expect(canReadPayRules(["employee" as RoleName], false, [])).toBe(false);
  });
});

describe("canViewAnyLaborCost / canViewProjectLaborCostOnly", () => {
  it("canViewAnyLaborCost grants manage-tier company-wide and the project's own PM", () => {
    expect(canViewAnyLaborCost(["company_admin"], false, [])).toBe(true);
    expect(canViewAnyLaborCost(["planner"], false, [])).toBe(true);
    expect(canViewAnyLaborCost(["employee" as RoleName], false, ["project_manager"])).toBe(true);
  });

  it("canViewAnyLaborCost denies operations_manager by default (Part 16's explicit exclusion)", () => {
    expect(canViewAnyLaborCost(["operations_manager"], false, [])).toBe(false);
  });

  it("canViewProjectLaborCostOnly is true ONLY for a PM whose sole basis is the project assignment (not also a manage-tier role)", () => {
    expect(canViewProjectLaborCostOnly(["employee" as RoleName], false, ["project_manager"])).toBe(true);
  });

  it("canViewProjectLaborCostOnly is false for a company_admin who is ALSO the project's PM — they get the fuller company-scope view, not the narrowed one", () => {
    expect(canViewProjectLaborCostOnly(["company_admin"], false, ["project_manager"])).toBe(false);
  });

  it("canViewProjectLaborCostOnly is false for someone with no project_manager assignment at all", () => {
    expect(canViewProjectLaborCostOnly(["employee" as RoleName], false, [])).toBe(false);
  });
});
