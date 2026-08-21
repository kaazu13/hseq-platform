import { describe, it, expect } from "vitest";
import { canManageDailyWorkforce, canManageOwnDailyTeam, canViewDailyWorkforceBroadly, canViewAvailableUnassignedPanel } from "./permissions";
import type { RoleName } from "@/modules/companies/types";

describe("canManageDailyWorkforce", () => {
  it("grants company-wide managers regardless of project assignment", () => {
    expect(canManageDailyWorkforce(["company_admin"], [])).toBe(true);
    expect(canManageDailyWorkforce(["operations_manager"], [])).toBe(true);
  });

  it("grants the project's own assigned Project Manager", () => {
    expect(canManageDailyWorkforce(["employee" as RoleName], ["project_manager"])).toBe(true);
  });

  it("denies a plain employee with no project_manager assignment", () => {
    expect(canManageDailyWorkforce(["employee" as RoleName], [])).toBe(false);
  });

  it("denies Foreman — deliberately excluded from the broad grant", () => {
    expect(canManageDailyWorkforce(["foreman"], [])).toBe(false);
  });

  it("denies HSE/Inspector roles — they can view, not manage", () => {
    expect(canManageDailyWorkforce(["hseq_manager"], [])).toBe(false);
    expect(canManageDailyWorkforce(["inspector"], [])).toBe(false);
  });
});

describe("canManageOwnDailyTeam", () => {
  it("grants a Foreman who is currently that specific team's foreman", () => {
    expect(canManageOwnDailyTeam(["foreman"], [], true)).toBe(true);
  });

  it("denies a Foreman who is NOT this specific team's foreman", () => {
    expect(canManageOwnDailyTeam(["foreman"], [], false)).toBe(false);
  });

  it("denies a non-foreman role even when isTeamForeman is somehow true (never trust that alone)", () => {
    expect(canManageOwnDailyTeam(["employee" as RoleName], [], true)).toBe(false);
  });

  it("still grants company-wide managers and the project PM, independent of isTeamForeman", () => {
    expect(canManageOwnDailyTeam(["company_admin"], [], false)).toBe(true);
    expect(canManageOwnDailyTeam(["employee" as RoleName], ["project_manager"], false)).toBe(true);
  });
});

describe("canViewDailyWorkforceBroadly", () => {
  it("grants company-wide managers even without explicit project access", () => {
    expect(canViewDailyWorkforceBroadly(["company_admin"], false)).toBe(true);
  });

  it("grants PM/HSE Manager/HSE Officer/Foreman only WITH project access", () => {
    for (const role of ["project_manager", "hseq_manager", "hse_officer", "foreman"] as RoleName[]) {
      expect(canViewDailyWorkforceBroadly([role], true)).toBe(true);
      expect(canViewDailyWorkforceBroadly([role], false)).toBe(false);
    }
  });

  it("denies a plain employee even with project access — falls through to RLS's own-row-only view", () => {
    expect(canViewDailyWorkforceBroadly(["employee" as RoleName], true)).toBe(false);
  });

  it("Inspector role correction: denies a plain Inspector even WITH project access — same personal 'own team only' treatment as Employee, never broad workforce visibility inferred from the role alone", () => {
    expect(canViewDailyWorkforceBroadly(["inspector"], true)).toBe(false);
    expect(canViewDailyWorkforceBroadly(["inspector"], false)).toBe(false);
  });

  it("an Inspector who ALSO holds a genuine broad-viewer role still gets broad access, via that OTHER role", () => {
    expect(canViewDailyWorkforceBroadly(["inspector", "foreman"], true)).toBe(true);
  });
});

describe("canViewAvailableUnassignedPanel — Part 1's exact authorized-viewer list", () => {
  it("allows company-wide managers regardless of project access", () => {
    expect(canViewAvailableUnassignedPanel(["company_admin"], [], false)).toBe(true);
    expect(canViewAvailableUnassignedPanel(["operations_manager"], [], false)).toBe(true);
  });

  it("allows the project's own assigned project_manager", () => {
    expect(canViewAvailableUnassignedPanel(["employee"], ["project_manager"], true)).toBe(true);
  });

  it("allows planner WITH project access", () => {
    expect(canViewAvailableUnassignedPanel(["planner"], [], true)).toBe(true);
    expect(canViewAvailableUnassignedPanel(["planner"], [], false)).toBe(false);
  });

  it("allows foreman WITH project access", () => {
    expect(canViewAvailableUnassignedPanel(["foreman"], [], true)).toBe(true);
    expect(canViewAvailableUnassignedPanel(["foreman"], [], false)).toBe(false);
  });

  it("denies inspector-only, hse_officer-only, hseq_manager-only, employee-only, recruiter-only even with project access", () => {
    for (const role of ["inspector", "hse_officer", "hseq_manager", "employee", "recruiter"] as const) {
      expect(canViewAvailableUnassignedPanel([role], [], true)).toBe(false);
    }
  });

  it("denies an empty role set", () => {
    expect(canViewAvailableUnassignedPanel([], [], true)).toBe(false);
  });
});
