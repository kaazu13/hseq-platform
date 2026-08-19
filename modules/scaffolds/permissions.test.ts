import { describe, it, expect } from "vitest";
import {
  canManageScaffold,
  canViewScaffoldRegister,
  canCreateScaffold,
  isScaffoldBroadCreator,
  mustSelfLockResponsibleForeman,
  canViewInspectionDashboard,
  canManageScaffoldInspection,
  mustSelfLockInspector,
} from "./permissions";

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

describe("canCreateScaffold / isScaffoldBroadCreator / mustSelfLockResponsibleForeman — V2, corrected per the completion pass", () => {
  it("company_admin is a broad creator company-wide — the genuine company-level HSEQ-authority role per its own seeded description", () => {
    expect(isScaffoldBroadCreator(["company_admin"], false)).toBe(true);
  });

  it("project_manager is a broad creator only WITH project access", () => {
    expect(isScaffoldBroadCreator(["project_manager"], true)).toBe(true);
    expect(isScaffoldBroadCreator(["project_manager"], false)).toBe(false);
  });

  it("REGRESSION: inspector create rejected — view-tier only, even with project access", () => {
    expect(isScaffoldBroadCreator(["inspector"], true)).toBe(false);
    expect(canCreateScaffold(["inspector"], true, false)).toBe(false);
    expect(canViewScaffoldRegister(["inspector"], true)).toBe(true);
  });

  it("REGRESSION: hse_officer create rejected — view-tier only, even with project access", () => {
    expect(isScaffoldBroadCreator(["hse_officer"], true)).toBe(false);
    expect(canCreateScaffold(["hse_officer"], true, false)).toBe(false);
    expect(canViewScaffoldRegister(["hse_officer"], true)).toBe(true);
  });

  it("REGRESSION: hseq_manager create rejected — no product-authorized exception; view-tier only", () => {
    expect(isScaffoldBroadCreator(["hseq_manager"], false)).toBe(false);
    expect(isScaffoldBroadCreator(["hseq_manager"], true)).toBe(false);
    expect(canCreateScaffold(["hseq_manager"], true, false)).toBe(false);
    expect(canViewScaffoldRegister(["hseq_manager"], false)).toBe(true);
  });

  it("REGRESSION: operations_manager create rejected — inspected and confirmed not a company-level HSEQ-authority role; view-tier only", () => {
    expect(isScaffoldBroadCreator(["operations_manager"], true)).toBe(false);
    expect(canCreateScaffold(["operations_manager"], true, false)).toBe(false);
    expect(canViewScaffoldRegister(["operations_manager"], false)).toBe(true);
  });

  it("REGRESSION: foreman create accepted, self-lock only", () => {
    expect(isScaffoldBroadCreator(["foreman"], true)).toBe(false);
    expect(canCreateScaffold(["foreman"], true, false)).toBe(false);
    expect(canCreateScaffold(["foreman"], true, true)).toBe(true);
    expect(mustSelfLockResponsibleForeman(["foreman"], true, true)).toBe(true);
  });

  it("REGRESSION: project_manager create accepted (their own active project)", () => {
    expect(canCreateScaffold(["project_manager"], true, false)).toBe(true);
  });

  it("REGRESSION: company_admin (the correct company-management role) create accepted", () => {
    expect(canCreateScaffold(["company_admin"], false, false)).toBe(true);
  });

  it("REGRESSION: employee denied entirely, on every path", () => {
    expect(canCreateScaffold(["employee"], true, false)).toBe(false);
    expect(isScaffoldBroadCreator(["employee"], true)).toBe(false);
    expect(canViewScaffoldRegister(["employee"], true)).toBe(false);
  });

  it("mustSelfLockResponsibleForeman is true ONLY for the foreman-only path, never for a broad creator who also happens to be an eligible foreman", () => {
    expect(mustSelfLockResponsibleForeman(["foreman"], true, true)).toBe(true);
    expect(mustSelfLockResponsibleForeman(["foreman", "project_manager"], true, true)).toBe(false);
    expect(mustSelfLockResponsibleForeman(["foreman"], true, false)).toBe(false);
    expect(mustSelfLockResponsibleForeman(["project_manager"], true, false)).toBe(false);
  });
});

describe("canViewInspectionDashboard — Part N's explicit access matrix (Inspection Dashboard / Scaffold Map)", () => {
  it("allows company_admin unconditionally (no project access needed)", () => {
    expect(canViewInspectionDashboard(["company_admin"], false)).toBe(true);
  });

  it("allows inspector/foreman/hse_officer/hseq_manager/project_manager/operations_manager/planner WITH project access", () => {
    for (const role of ["inspector", "foreman", "hse_officer", "hseq_manager", "project_manager", "operations_manager", "planner"] as const) {
      expect(canViewInspectionDashboard([role], true)).toBe(true);
    }
  });

  it("denies every one of those roles WITHOUT project access", () => {
    for (const role of ["inspector", "foreman", "hse_officer", "hseq_manager", "project_manager", "operations_manager", "planner"] as const) {
      expect(canViewInspectionDashboard([role], false)).toBe(false);
    }
  });

  it("denies employee and recruiter even WITH project access — explicitly excluded by Part N", () => {
    expect(canViewInspectionDashboard(["employee"], true)).toBe(false);
    expect(canViewInspectionDashboard(["recruiter"], true)).toBe(false);
  });

  it("dashboard read access does not imply inspection manage/finalize authority — canManageScaffold is unchanged", () => {
    expect(canViewInspectionDashboard(["foreman"], true)).toBe(true);
    expect(canManageScaffold(["foreman"], true)).toBe(false);
  });
});

describe("canManageScaffoldInspection — Part 8's expanded inspection creation tier", () => {
  it("still allows the pre-existing canManageScaffold tiers", () => {
    expect(canManageScaffoldInspection(["hseq_manager"], false, [])).toBe(true);
    expect(canManageScaffoldInspection(["hse_officer"], true, [])).toBe(true);
    expect(canManageScaffoldInspection(["inspector"], true, [])).toBe(true);
    expect(canManageScaffoldInspection(["hse_officer"], false, [])).toBe(false);
  });

  it("adds company_admin unconditionally", () => {
    expect(canManageScaffoldInspection(["company_admin"], false, [])).toBe(true);
  });

  it("adds the project's own assigned project_manager", () => {
    expect(canManageScaffoldInspection(["employee"], true, ["project_manager"])).toBe(true);
    expect(canManageScaffoldInspection(["employee"], true, [])).toBe(false);
  });

  it("does NOT grant scaffold EDIT authority (canManageScaffold is a separate, unchanged function) — a regression guard against accidentally widening updateScaffold's gate", () => {
    expect(canManageScaffold(["company_admin"], true)).toBe(false);
  });

  it("still denies foreman, employee, recruiter, planner, operations_manager with no other qualifying role", () => {
    for (const role of ["foreman", "employee", "recruiter", "planner", "operations_manager"] as const) {
      expect(canManageScaffoldInspection([role], true, [])).toBe(false);
    }
  });
});

describe("mustSelfLockInspector — Part 7/8's self-lock vs free-pick tiers", () => {
  it("locks inspector and foreman (project-scoped roles with no admin/HSE-tier role held)", () => {
    expect(mustSelfLockInspector(["inspector"], true, [])).toBe(true);
    expect(mustSelfLockInspector(["foreman"], true, [])).toBe(true);
  });

  it("gives a free pick to hseq_manager, hse_officer (with project access), company_admin, and the project's own project_manager", () => {
    expect(mustSelfLockInspector(["hseq_manager"], false, [])).toBe(false);
    expect(mustSelfLockInspector(["hse_officer"], true, [])).toBe(false);
    expect(mustSelfLockInspector(["company_admin"], false, [])).toBe(false);
    expect(mustSelfLockInspector(["employee"], true, ["project_manager"])).toBe(false);
  });

  it("hse_officer WITHOUT project access is still locked (matches canManageScaffold's own project-scoping — though canManageScaffoldInspection would deny them the page entirely in that case)", () => {
    expect(mustSelfLockInspector(["hse_officer"], false, [])).toBe(true);
  });

  it("a multi-role account is free-pick if ANY held role qualifies", () => {
    expect(mustSelfLockInspector(["inspector", "hseq_manager"], true, [])).toBe(false);
  });
});
