import { describe, it, expect } from "vitest";
import { canCreateLmra, canManageLmra, canArchiveLmra } from "./permissions";

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
