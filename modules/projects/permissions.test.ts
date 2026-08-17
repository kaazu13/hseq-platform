import { describe, it, expect } from "vitest";
import { canCreateProjects, canManageProject, canEditProjectLocationSettings, canEditProjectSiteLocation } from "./permissions";

describe("canCreateProjects", () => {
  it("allows company_admin and operations_manager", () => {
    expect(canCreateProjects(["company_admin"])).toBe(true);
    expect(canCreateProjects(["operations_manager"])).toBe(true);
  });

  it("denies every other role, since no project exists yet for a project_manager assignment to attach to", () => {
    expect(canCreateProjects(["project_manager"])).toBe(false);
    expect(canCreateProjects(["hseq_manager"])).toBe(false);
    expect(canCreateProjects([])).toBe(false);
  });
});

describe("canManageProject", () => {
  it("allows an company-wide manager regardless of project-specific roles", () => {
    expect(canManageProject(["company_admin"], [])).toBe(true);
    expect(canManageProject(["operations_manager"], [])).toBe(true);
  });

  it("allows this project's own assigned Project Manager, even without any company-wide role", () => {
    expect(canManageProject(["employee"], ["project_manager"])).toBe(true);
  });

  it("denies someone with neither an company-wide manager role nor a project_manager assignment on this project", () => {
    expect(canManageProject(["hseq_manager"], [])).toBe(false);
    expect(canManageProject(["employee"], [])).toBe(false);
  });

  it("does not treat any OTHER project_assignments role (member, hseq_manager, hse_officer, inspector) as manage access", () => {
    expect(canManageProject(["employee"], ["member"])).toBe(false);
    expect(canManageProject(["employee"], ["hseq_manager"])).toBe(false);
    expect(canManageProject(["employee"], ["hse_officer"])).toBe(false);
    expect(canManageProject(["employee"], ["inspector"])).toBe(false);
  });

  it("a project_manager assignment on a DIFFERENT project doesn't leak in — caller must pass only THIS project's roles", () => {
    // canManageProject trusts its `myProjectAssignmentRoles` argument completely;
    // this test documents that trust boundary — the caller (getMyProjectAssignmentRoles)
    // is responsible for scoping to the correct project, not this function.
    expect(canManageProject(["employee"], [])).toBe(false);
  });
});

describe("canEditProjectLocationSettings (Task 3 Part 12)", () => {
  it("allows company_admin", () => {
    expect(canEditProjectLocationSettings(["company_admin"])).toBe(true);
  });

  it("denies operations_manager and an assigned project_manager, even though both can manage every OTHER project field", () => {
    expect(canEditProjectLocationSettings(["operations_manager"])).toBe(false);
    expect(canEditProjectLocationSettings(["project_manager"])).toBe(false);
  });

  it("denies a plain employee", () => {
    expect(canEditProjectLocationSettings(["employee"])).toBe(false);
    expect(canEditProjectLocationSettings([])).toBe(false);
  });
});

describe("canEditProjectSiteLocation (Task 3 Part 13)", () => {
  it("allows company_admin and planner", () => {
    expect(canEditProjectSiteLocation(["company_admin"])).toBe(true);
    expect(canEditProjectSiteLocation(["planner"])).toBe(true);
  });

  it("denies operations_manager and an assigned project_manager, same as the country/timezone gate", () => {
    expect(canEditProjectSiteLocation(["operations_manager"])).toBe(false);
    expect(canEditProjectSiteLocation(["project_manager"])).toBe(false);
  });

  it("is broader than canEditProjectLocationSettings by exactly one role (planner)", () => {
    expect(canEditProjectLocationSettings(["planner"])).toBe(false);
    expect(canEditProjectSiteLocation(["planner"])).toBe(true);
  });
});
