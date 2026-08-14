import { describe, it, expect } from "vitest";
import { canManageEquipment } from "./permissions";
import type { RoleName } from "@/modules/companies/types";

describe("canManageEquipment", () => {
  it("grants company-wide managers for a company-wide item (null project)", () => {
    expect(canManageEquipment(["company_admin"], null, [])).toBe(true);
    expect(canManageEquipment(["operations_manager"], null, [])).toBe(true);
  });

  it("grants company-wide managers for a project-scoped item too", () => {
    expect(canManageEquipment(["company_admin"], "project-1", [])).toBe(true);
  });

  it("grants the item's own assigned Project Manager", () => {
    expect(canManageEquipment(["employee" as RoleName], "project-1", ["project_manager"])).toBe(true);
  });

  it("denies a Project Manager for a company-wide (null project) item — a PM's authority never extends to company stock", () => {
    expect(canManageEquipment(["employee" as RoleName], null, ["project_manager"])).toBe(false);
  });

  it("denies a plain employee with no project_manager assignment", () => {
    expect(canManageEquipment(["employee" as RoleName], "project-1", [])).toBe(false);
  });

  it("denies Foreman/HSE roles — they can view, not manage", () => {
    expect(canManageEquipment(["foreman"], "project-1", [])).toBe(false);
    expect(canManageEquipment(["hseq_manager"], "project-1", [])).toBe(false);
    expect(canManageEquipment(["hse_officer"], "project-1", [])).toBe(false);
  });
});
