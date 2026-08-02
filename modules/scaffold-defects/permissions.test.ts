import { describe, it, expect } from "vitest";
import { canManageScaffoldDefectDetails, canUpdateScaffoldDefectProgress, canCloseScaffoldDefect } from "./permissions";

describe("canManageScaffoldDefectDetails", () => {
  it("allows an HSE Manager regardless of project access", () => {
    expect(canManageScaffoldDefectDetails(["hseq_manager"], false)).toBe(true);
  });

  it("allows HSE Officer/Inspector WITH project access", () => {
    expect(canManageScaffoldDefectDetails(["hse_officer"], true)).toBe(true);
    expect(canManageScaffoldDefectDetails(["inspector"], true)).toBe(true);
  });

  it("denies HSE Officer/Inspector WITHOUT project access", () => {
    expect(canManageScaffoldDefectDetails(["hse_officer"], false)).toBe(false);
  });

  it("denies Foreman/Project Manager/Employee even with project access — no Project-Manager-unrestricted branch here, unlike corrective_actions", () => {
    expect(canManageScaffoldDefectDetails(["foreman"], true)).toBe(false);
    expect(canManageScaffoldDefectDetails(["project_manager"], true)).toBe(false);
    expect(canManageScaffoldDefectDetails(["employee"], true)).toBe(false);
  });
});

describe("canUpdateScaffoldDefectProgress", () => {
  it("allows a manage-tier role to progress any defect", () => {
    expect(canUpdateScaffoldDefectProgress(["hseq_manager"], false, false)).toBe(true);
  });

  it("allows a Foreman to progress a defect ASSIGNED TO THEM, despite otherwise being view-only for the whole module — 'scaffold responsibilities'", () => {
    expect(canUpdateScaffoldDefectProgress(["foreman"], false, true)).toBe(true);
  });

  it("denies a Foreman progressing a defect NOT assigned to them", () => {
    expect(canUpdateScaffoldDefectProgress(["foreman"], false, false)).toBe(false);
  });
});

describe("canCloseScaffoldDefect", () => {
  it("allows an HSE Manager to close/reject/reopen ANY defect", () => {
    expect(canCloseScaffoldDefect(["hseq_manager"], false, false)).toBe(true);
  });

  it("allows HSE Officer/Inspector to close a defect they authored OR are assigned to, given project access", () => {
    expect(canCloseScaffoldDefect(["hse_officer"], true, true)).toBe(true);
  });

  it("denies HSE Officer/Inspector closing a defect assigned to someone else that they didn't author", () => {
    expect(canCloseScaffoldDefect(["hse_officer"], true, false)).toBe(false);
  });

  it("denies without project access even if it's their own entry", () => {
    expect(canCloseScaffoldDefect(["hse_officer"], false, true)).toBe(false);
  });

  it("denies a Foreman outright, even for their own assigned defect — closing authority is manage-tier only here, unlike updating progress", () => {
    expect(canCloseScaffoldDefect(["foreman"], true, true)).toBe(false);
  });
});
