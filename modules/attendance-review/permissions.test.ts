import { describe, it, expect } from "vitest";
import { canReviewAttendance } from "./permissions";

describe("canReviewAttendance (Task 3 Part 19)", () => {
  it("allows company_admin and operations_manager regardless of project-specific roles", () => {
    expect(canReviewAttendance(["company_admin"], [])).toBe(true);
    expect(canReviewAttendance(["operations_manager"], [])).toBe(true);
  });

  it("allows this project's own assigned project_manager", () => {
    expect(canReviewAttendance(["employee"], ["project_manager"])).toBe(true);
  });

  it("denies hseq_manager, hse_officer, and foreman — narrower than canManageDailyWorkforce", () => {
    expect(canReviewAttendance(["hseq_manager"], [])).toBe(false);
    expect(canReviewAttendance(["hse_officer"], [])).toBe(false);
    expect(canReviewAttendance(["foreman"], [])).toBe(false);
  });

  it("denies a plain employee with no reviewer standing", () => {
    expect(canReviewAttendance(["employee"], [])).toBe(false);
    expect(canReviewAttendance([], [])).toBe(false);
  });
});
