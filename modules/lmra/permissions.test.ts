import { describe, it, expect } from "vitest";
import { canManageLmra, canArchiveLmra } from "./permissions";

describe("canManageLmra", () => {
  it("allows an HSE Manager regardless of foreman standing", () => {
    expect(canManageLmra(["hseq_manager"], false)).toBe(true);
    expect(canManageLmra(["hseq_manager"], true)).toBe(true);
  });

  it("allows the caller's own foreman standing on this project, even without any company-wide role", () => {
    expect(canManageLmra(["employee"], true)).toBe(true);
  });

  it("denies someone with neither hseq_manager nor foreman standing on this project — including roles Full elsewhere", () => {
    expect(canManageLmra(["employee"], false)).toBe(false);
    expect(canManageLmra([], false)).toBe(false);
  });

  it("does NOT grant access to company_admin/operations_manager/project_manager — LMRA is View-only for those roles per docs/ROLES_AND_PERMISSIONS.md §5, unlike every other module's write gate", () => {
    expect(canManageLmra(["company_admin"], false)).toBe(false);
    expect(canManageLmra(["operations_manager"], false)).toBe(false);
    expect(canManageLmra(["project_manager"], false)).toBe(false);
  });
});

describe("canArchiveLmra", () => {
  it("allows only hseq_manager", () => {
    expect(canArchiveLmra(["hseq_manager"])).toBe(true);
  });

  it("denies a foreman's manage-tier access from also archiving — the F-vs-M distinction", () => {
    // canArchiveLmra takes only roleNames, not foreman standing — this
    // documents that a caller who is a Foreman (and therefore passes
    // canManageLmra) still cannot archive without also holding hseq_manager.
    expect(canArchiveLmra(["employee"])).toBe(false);
    expect(canArchiveLmra(["foreman"])).toBe(false);
  });

  it("denies company_admin/operations_manager, same as canManageLmra", () => {
    expect(canArchiveLmra(["company_admin"])).toBe(false);
    expect(canArchiveLmra(["operations_manager"])).toBe(false);
    expect(canArchiveLmra([])).toBe(false);
  });
});
