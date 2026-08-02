import { describe, it, expect } from "vitest";
import { isScaffoldDefectOverdue, hasUnresolvedScaffoldDefects } from "./types";

const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const TODAY = new Date().toISOString().slice(0, 10);
const TOMORROW = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe("isScaffoldDefectOverdue", () => {
  it("is overdue: due date in the past, status still unresolved", () => {
    expect(isScaffoldDefectOverdue(YESTERDAY, "open")).toBe(true);
    expect(isScaffoldDefectOverdue(YESTERDAY, "in_progress")).toBe(true);
    expect(isScaffoldDefectOverdue(YESTERDAY, "awaiting_verification")).toBe(true);
  });

  it("is NOT overdue once closed or rejected, even with a past due date", () => {
    expect(isScaffoldDefectOverdue(YESTERDAY, "closed")).toBe(false);
    expect(isScaffoldDefectOverdue(YESTERDAY, "rejected")).toBe(false);
  });

  it("is NOT overdue when the due date is today or in the future", () => {
    expect(isScaffoldDefectOverdue(TODAY, "open")).toBe(false);
    expect(isScaffoldDefectOverdue(TOMORROW, "open")).toBe(false);
  });
});

describe("hasUnresolvedScaffoldDefects", () => {
  it("is false for an empty list", () => {
    expect(hasUnresolvedScaffoldDefects([])).toBe(false);
  });

  it("is false when every defect is closed or rejected — the scaffold inspection can then finalize as safe_for_use", () => {
    expect(hasUnresolvedScaffoldDefects([{ status: "closed" }, { status: "rejected" }])).toBe(false);
  });

  it("is true when at least one defect is open/in_progress/awaiting_verification, regardless of severity — 'critical' is the clearest case of this same general rule, not a separate check", () => {
    expect(hasUnresolvedScaffoldDefects([{ status: "closed" }, { status: "open" }])).toBe(true);
    expect(hasUnresolvedScaffoldDefects([{ status: "in_progress" }])).toBe(true);
    expect(hasUnresolvedScaffoldDefects([{ status: "awaiting_verification" }])).toBe(true);
  });
});
