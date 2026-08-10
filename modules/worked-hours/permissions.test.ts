import { describe, it, expect } from "vitest";
import { canManageWorkedHours } from "./permissions";
import type { RoleName } from "@/modules/companies/types";

describe("canManageWorkedHours", () => {
  it("grants company-wide managers regardless of project assignment", () => {
    expect(canManageWorkedHours(["company_admin"], [])).toBe(true);
    expect(canManageWorkedHours(["operations_manager"], [])).toBe(true);
  });

  it("grants the project's own assigned Project Manager", () => {
    expect(canManageWorkedHours(["employee" as RoleName], ["project_manager"])).toBe(true);
  });

  it("denies a plain employee with no project_manager assignment", () => {
    expect(canManageWorkedHours(["employee" as RoleName], [])).toBe(false);
  });

  it("denies Foreman/HSE/Inspector — deliberately narrower than daily-workforce, per the milestone's explicit role direction", () => {
    expect(canManageWorkedHours(["foreman"], [])).toBe(false);
    expect(canManageWorkedHours(["hseq_manager"], [])).toBe(false);
    expect(canManageWorkedHours(["hse_officer"], [])).toBe(false);
    expect(canManageWorkedHours(["inspector"], [])).toBe(false);
  });
});
