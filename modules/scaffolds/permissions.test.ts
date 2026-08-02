import { describe, it, expect } from "vitest";
import { canManageScaffold } from "./permissions";

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
