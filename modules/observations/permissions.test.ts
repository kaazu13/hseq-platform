import { describe, it, expect } from "vitest";
import { canCreateObservation, canEditObservation, canReviewOrCloseObservation } from "./permissions";

describe("canCreateObservation", () => {
  it("allows an HSE Manager regardless of project access", () => {
    expect(canCreateObservation(["hseq_manager"], false)).toBe(true);
    expect(canCreateObservation(["hseq_manager"], true)).toBe(true);
  });

  it("allows HSE Officer/Foreman/Inspector/Employee WITH project access", () => {
    expect(canCreateObservation(["hse_officer"], true)).toBe(true);
    expect(canCreateObservation(["foreman"], true)).toBe(true);
    expect(canCreateObservation(["inspector"], true)).toBe(true);
    expect(canCreateObservation(["employee"], true)).toBe(true);
  });

  it("denies HSE Officer/Foreman/Inspector/Employee WITHOUT project access", () => {
    expect(canCreateObservation(["hse_officer"], false)).toBe(false);
    expect(canCreateObservation(["foreman"], false)).toBe(false);
    expect(canCreateObservation(["inspector"], false)).toBe(false);
    expect(canCreateObservation(["employee"], false)).toBe(false);
  });

  it("denies company_admin/operations_manager/project_manager — View-only per docs/ROLES_AND_PERMISSIONS.md §5, even with project access (the V⁴-not-C⁴ distinction a plain project-access check can't express)", () => {
    expect(canCreateObservation(["company_admin"], true)).toBe(false);
    expect(canCreateObservation(["operations_manager"], true)).toBe(false);
    expect(canCreateObservation(["project_manager"], true)).toBe(false);
  });

  it("denies no roles at all", () => {
    expect(canCreateObservation([], true)).toBe(false);
  });
});

describe("canEditObservation", () => {
  it("allows an HSE Manager to edit ANY observation, even one they didn't author", () => {
    expect(canEditObservation(["hseq_manager"], false, false)).toBe(true);
  });

  it("allows the author to edit their OWN observation, given project access", () => {
    expect(canEditObservation(["foreman"], true, true)).toBe(true);
  });

  it("denies editing someone else's observation — the genuine departure from LMRA, where a Foreman manages every record on their project, not just their own", () => {
    expect(canEditObservation(["foreman"], true, false)).toBe(false);
  });

  it("denies editing even your own observation without project access (e.g. reassigned off the project since authoring it)", () => {
    expect(canEditObservation(["foreman"], false, true)).toBe(false);
  });

  it("denies a role with no create/edit standing at all, even for their own entry", () => {
    expect(canEditObservation(["project_manager"], true, true)).toBe(false);
  });
});

describe("canReviewOrCloseObservation", () => {
  it("allows only hseq_manager", () => {
    expect(canReviewOrCloseObservation(["hseq_manager"])).toBe(true);
  });

  it("denies every other role, including the observation's own author — 'approve' is in HSE Manager's 'M' definition, not in 'C'", () => {
    expect(canReviewOrCloseObservation(["foreman"])).toBe(false);
    expect(canReviewOrCloseObservation(["hse_officer"])).toBe(false);
    expect(canReviewOrCloseObservation(["inspector"])).toBe(false);
    expect(canReviewOrCloseObservation(["employee"])).toBe(false);
    expect(canReviewOrCloseObservation(["company_admin"])).toBe(false);
    expect(canReviewOrCloseObservation([])).toBe(false);
  });
});
