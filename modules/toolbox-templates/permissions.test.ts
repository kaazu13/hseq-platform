import { describe, it, expect } from "vitest";
import { canManageToolboxTemplate, canViewToolboxTemplate } from "./permissions";

describe("canManageToolboxTemplate", () => {
  it("hseq_manager and hse_officer can manage — no project dimension, so no hasProjectAccess parameter needed", () => {
    expect(canManageToolboxTemplate(["hseq_manager"])).toBe(true);
    expect(canManageToolboxTemplate(["hse_officer"])).toBe(true);
  });

  it("foreman/project_manager/inspector/employee/company_admin cannot manage", () => {
    expect(canManageToolboxTemplate(["foreman"])).toBe(false);
    expect(canManageToolboxTemplate(["project_manager"])).toBe(false);
    expect(canManageToolboxTemplate(["inspector"])).toBe(false);
    expect(canManageToolboxTemplate(["employee"])).toBe(false);
    expect(canManageToolboxTemplate(["company_admin"])).toBe(false);
  });
});

describe("canViewToolboxTemplate", () => {
  it("company_admin/operations_manager/hseq_manager/hse_officer/project_manager/foreman/inspector can view", () => {
    for (const role of ["company_admin", "operations_manager", "hseq_manager", "hse_officer", "project_manager", "foreman", "inspector"] as const) {
      expect(canViewToolboxTemplate([role])).toBe(true);
    }
  });

  it("employee cannot view — templates are an HSE planning resource, not employee-facing", () => {
    expect(canViewToolboxTemplate(["employee"])).toBe(false);
  });
});
