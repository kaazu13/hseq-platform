import { describe, it, expect } from "vitest";
import { canManageScaffold, canViewScaffoldRegister, canCreateScaffold, isScaffoldBroadCreator, mustSelfLockResponsibleForeman } from "./permissions";

describe("canManageScaffold", () => {
  it("allows an HSE Manager regardless of project access", () => {
    expect(canManageScaffold(["hseq_manager"], false)).toBe(true);
    expect(canManageScaffold(["hseq_manager"], true)).toBe(true);
  });

  it("allows HSE Officer/Inspector WITH project access", () => {
    expect(canManageScaffold(["hse_officer"], true)).toBe(true);
    expect(canManageScaffold(["inspector"], true)).toBe(true);
  });

  it("denies HSE Officer/Inspector WITHOUT project access", () => {
    expect(canManageScaffold(["hse_officer"], false)).toBe(false);
    expect(canManageScaffold(["inspector"], false)).toBe(false);
  });

  it("denies Foreman even WITH project access — the genuine departure from LMRA/Safety Observations: Scaffold Inspections is a specialist-inspector function, docs' 'V⁴' not 'M⁴'/'C⁴'", () => {
    expect(canManageScaffold(["foreman"], true)).toBe(false);
  });

  it("denies Project Manager and Employee — also 'V⁴' per docs, even with project access", () => {
    expect(canManageScaffold(["project_manager"], true)).toBe(false);
    expect(canManageScaffold(["employee"], true)).toBe(false);
  });

  it("denies company_admin/operations_manager — View-only per docs", () => {
    expect(canManageScaffold(["company_admin"], true)).toBe(false);
    expect(canManageScaffold(["operations_manager"], true)).toBe(false);
  });

  it("denies no roles at all", () => {
    expect(canManageScaffold([], true)).toBe(false);
  });
});

describe("canViewScaffoldRegister — V2: employees excluded entirely", () => {
  it("allows company_admin/operations_manager/hseq_manager company-wide", () => {
    expect(canViewScaffoldRegister(["company_admin"], false)).toBe(true);
    expect(canViewScaffoldRegister(["operations_manager"], false)).toBe(true);
    expect(canViewScaffoldRegister(["hseq_manager"], false)).toBe(true);
  });

  it("allows project_manager/hse_officer/foreman/inspector only WITH project access", () => {
    for (const role of ["project_manager", "hse_officer", "foreman", "inspector"] as const) {
      expect(canViewScaffoldRegister([role], true)).toBe(true);
      expect(canViewScaffoldRegister([role], false)).toBe(false);
    }
  });

  it("denies a plain employee even WITH project access — the actual V2 rule change", () => {
    expect(canViewScaffoldRegister(["employee"], true)).toBe(false);
    expect(canViewScaffoldRegister(["employee"], false)).toBe(false);
  });

  it("denies no roles at all", () => {
    expect(canViewScaffoldRegister([], true)).toBe(false);
  });
});

describe("canCreateScaffold / isScaffoldBroadCreator / mustSelfLockResponsibleForeman — V2", () => {
  it("hseq_manager and company_admin are broad creators company-wide", () => {
    expect(isScaffoldBroadCreator(["hseq_manager"], false)).toBe(true);
    expect(isScaffoldBroadCreator(["company_admin"], false)).toBe(true);
  });

  it("hse_officer/inspector/project_manager are broad creators only WITH project access", () => {
    for (const role of ["hse_officer", "inspector", "project_manager"] as const) {
      expect(isScaffoldBroadCreator([role], true)).toBe(true);
      expect(isScaffoldBroadCreator([role], false)).toBe(false);
    }
  });

  it("operations_manager is deliberately NOT a broad creator, unlike its view-tier inclusion", () => {
    expect(isScaffoldBroadCreator(["operations_manager"], true)).toBe(false);
    expect(canViewScaffoldRegister(["operations_manager"], false)).toBe(true);
  });

  it("a plain Foreman with no other role can create ONLY via the isEligibleForeman flag, never via role alone", () => {
    expect(isScaffoldBroadCreator(["foreman"], true)).toBe(false);
    expect(canCreateScaffold(["foreman"], true, false)).toBe(false);
    expect(canCreateScaffold(["foreman"], true, true)).toBe(true);
  });

  it("a broad creator can create even without being flagged as an eligible foreman themselves", () => {
    expect(canCreateScaffold(["project_manager"], true, false)).toBe(true);
  });

  it("mustSelfLockResponsibleForeman is true ONLY for the foreman-only path, never for a broad creator who also happens to be an eligible foreman", () => {
    expect(mustSelfLockResponsibleForeman(["foreman"], true, true)).toBe(true);
    expect(mustSelfLockResponsibleForeman(["foreman", "project_manager"], true, true)).toBe(false);
    expect(mustSelfLockResponsibleForeman(["foreman"], true, false)).toBe(false);
    expect(mustSelfLockResponsibleForeman(["project_manager"], true, false)).toBe(false);
  });

  it("denies a plain employee outright, on every path", () => {
    expect(canCreateScaffold(["employee"], true, false)).toBe(false);
    expect(isScaffoldBroadCreator(["employee"], true)).toBe(false);
  });
});
