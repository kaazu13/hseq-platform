import { describe, it, expect } from "vitest";
import { isCorrectiveActionOverdue, hasUnresolvedCorrectiveActions } from "./types";

const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const TODAY = new Date().toISOString().slice(0, 10);
const TOMORROW = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe("isCorrectiveActionOverdue", () => {
  it("is overdue: due date in the past, status still unresolved", () => {
    expect(isCorrectiveActionOverdue(YESTERDAY, "open")).toBe(true);
    expect(isCorrectiveActionOverdue(YESTERDAY, "in_progress")).toBe(true);
    expect(isCorrectiveActionOverdue(YESTERDAY, "awaiting_verification")).toBe(true);
  });

  it("is NOT overdue once closed or rejected, even with a past due date — this milestone's explicit 'derived consistently' requirement means a resolved action is never flagged overdue regardless of when it was resolved", () => {
    expect(isCorrectiveActionOverdue(YESTERDAY, "closed")).toBe(false);
    expect(isCorrectiveActionOverdue(YESTERDAY, "rejected")).toBe(false);
  });

  it("is NOT overdue when the due date is today", () => {
    expect(isCorrectiveActionOverdue(TODAY, "open")).toBe(false);
  });

  it("is NOT overdue when the due date is in the future", () => {
    expect(isCorrectiveActionOverdue(TOMORROW, "open")).toBe(false);
  });
});

describe("hasUnresolvedCorrectiveActions", () => {
  it("is false for an empty list", () => {
    expect(hasUnresolvedCorrectiveActions([])).toBe(false);
  });

  it("is false when every action is closed or rejected", () => {
    expect(hasUnresolvedCorrectiveActions([{ status: "closed" }, { status: "rejected" }])).toBe(false);
  });

  it("is true when at least one action is open/in_progress/awaiting_verification, mirroring assert_no_unresolved_corrective_actions() in the migration exactly", () => {
    expect(hasUnresolvedCorrectiveActions([{ status: "closed" }, { status: "open" }])).toBe(true);
    expect(hasUnresolvedCorrectiveActions([{ status: "in_progress" }])).toBe(true);
    expect(hasUnresolvedCorrectiveActions([{ status: "awaiting_verification" }])).toBe(true);
  });
});
