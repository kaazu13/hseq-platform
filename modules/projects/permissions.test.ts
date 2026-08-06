import { describe, it, expect } from "vitest";
import { canCreateProjects, canManageProject } from "./permissions";

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
