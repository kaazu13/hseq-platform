import { describe, it, expect } from "vitest";
import { canCreateLmra, canManageLmra, canArchiveLmra, canViewAllProjectLmra, canReviewLmra } from "./permissions";

describe("canCreateLmra", () => {
  it("allows an HSE Manager regardless of project access/foreman standing", () => {
    expect(canCreateLmra(["hseq_manager"], false, false)).toBe(true);
  });

  it("allows the caller's own foreman standing on this project, even without project access being separately true", () => {
    expect(canCreateLmra(["employee"], false, true)).toBe(true);
  });

  it("allows an ordinary employee with plain project access — Phase 1's 'not only foremen' requirement", () => {
    expect(canCreateLmra(["employee"], true, false)).toBe(true);
  });

  it("denies someone with none of hseq_manager, foreman standing, or project access", () => {
    expect(canCreateLmra(["employee"], false, false)).toBe(false);
    expect(canCreateLmra([], false, false)).toBe(false);
  });
});

describe("canManageLmra", () => {
  it("allows an HSE Manager regardless of foreman/own-assessment standing", () => {
    expect(canManageLmra(["hseq_manager"], false, false)).toBe(true);
  });

  it("allows the caller's own foreman standing on this project", () => {
    expect(canManageLmra(["employee"], true, false)).toBe(true);
  });

  it("allows an ordinary employee managing their OWN assessment — Phase 1's self-scoped edit grant", () => {
    expect(canManageLmra(["employee"], false, true)).toBe(true);
  });

  it("denies an ordinary employee for an assessment that is not their own", () => {
    expect(canManageLmra(["employee"], false, false)).toBe(false);
  });

  it("does NOT grant access to company_admin/operations_manager/project_manager — LMRA is View-only for those roles, unless they also happen to be the assessment's own completer", () => {
    expect(canManageLmra(["company_admin"], false, false)).toBe(false);
    expect(canManageLmra(["operations_manager"], false, false)).toBe(false);
    expect(canManageLmra(["project_manager"], false, false)).toBe(false);
  });
});

describe("canArchiveLmra", () => {
  it("allows only hseq_manager", () => {
    expect(canArchiveLmra(["hseq_manager"])).toBe(true);
  });

  it("denies a foreman's manage-tier access from also archiving — the F-vs-M distinction", () => {
    expect(canArchiveLmra(["employee"])).toBe(false);
    expect(canArchiveLmra(["foreman"])).toBe(false);
  });

  it("denies company_admin/operations_manager, same as canManageLmra", () => {
    expect(canArchiveLmra(["company_admin"])).toBe(false);
    expect(canArchiveLmra(["operations_manager"])).toBe(false);
    expect(canArchiveLmra([])).toBe(false);
  });
});

describe("canReviewLmra — review-decision gate (Task 3 Part 1 self-approval fix)", () => {
  it("allows a project Foreman", () => {
    expect(canReviewLmra(["employee"], true)).toBe(true);
  });

  it("allows hseq_manager, hse_officer, company_admin, operations_manager, and project_manager without needing foreman standing", () => {
    expect(canReviewLmra(["hseq_manager"], false)).toBe(true);
    expect(canReviewLmra(["hse_officer"], false)).toBe(true);
    expect(canReviewLmra(["company_admin"], false)).toBe(true);
    expect(canReviewLmra(["operations_manager"], false)).toBe(true);
    expect(canReviewLmra(["project_manager"], false)).toBe(true);
  });

  it("denies a plain employee with no reviewer role or foreman standing — an ordinary worker, including the assessment's own completer, can never satisfy this on role/foreman grounds alone (there is deliberately no isOwnAssessment parameter)", () => {
    expect(canReviewLmra(["employee"], false)).toBe(false);
    expect(canReviewLmra([], false)).toBe(false);
  });

  it("denies roles this app doesn't treat as LMRA reviewers", () => {
    expect(canReviewLmra(["inspector"], false)).toBe(false);
    expect(canReviewLmra(["planner"], false)).toBe(false);
    expect(canReviewLmra(["recruiter"], false)).toBe(false);
  });
});

describe("canViewAllProjectLmra — item 9's 'All LMRAs' tab gate", () => {
  it("allows a project Foreman regardless of company-wide role", () => {
    expect(canViewAllProjectLmra(["employee"], true)).toBe(true);
  });

  it("allows hseq_manager, company_admin, operations_manager, and project_manager without needing foreman standing", () => {
    expect(canViewAllProjectLmra(["hseq_manager"], false)).toBe(true);
    expect(canViewAllProjectLmra(["company_admin"], false)).toBe(true);
    expect(canViewAllProjectLmra(["operations_manager"], false)).toBe(true);
    expect(canViewAllProjectLmra(["project_manager"], false)).toBe(true);
  });

  it("denies an ordinary employee with neither foreman standing nor an authorized management role — My LMRAs only", () => {
    expect(canViewAllProjectLmra(["employee"], false)).toBe(false);
    expect(canViewAllProjectLmra([], false)).toBe(false);
  });

  it("denies roles this app doesn't treat as project-wide LMRA management, even though RLS itself would technically allow the underlying read for any project member — never silently broadened", () => {
    expect(canViewAllProjectLmra(["inspector"], false)).toBe(false);
    expect(canViewAllProjectLmra(["planner"], false)).toBe(false);
    expect(canViewAllProjectLmra(["recruiter"], false)).toBe(false);
  });
});
