import { describe, it, expect } from "vitest";
import { countLeaveCalendarDays, LEAVE_TYPES, ALL_LEAVE_TYPES, LEAVE_TYPE_LABELS } from "./types";

describe("leave type relabel (Task 3 Part 4)", () => {
  it("offers exactly the new canonical set for a new request", () => {
    expect(LEAVE_TYPES).toEqual(["sick", "holiday", "emergency", "other"]);
  });

  it("still accepts every legacy type for validation/rendering purposes", () => {
    expect(ALL_LEAVE_TYPES).toEqual(expect.arrayContaining(["annual", "unpaid", "compassionate", "sick", "holiday", "emergency", "other"]));
  });

  it("gives every legacy AND current type a friendly, non-raw label", () => {
    for (const type of ALL_LEAVE_TYPES) {
      expect(LEAVE_TYPE_LABELS[type]).toBeTruthy();
      expect(LEAVE_TYPE_LABELS[type]).not.toBe(type);
    }
  });
});

describe("countLeaveCalendarDays", () => {
  it("counts a single day as 1", () => {
    expect(countLeaveCalendarDays("2026-08-20", "2026-08-20")).toBe(1);
  });

  it("counts an inclusive range", () => {
    expect(countLeaveCalendarDays("2026-08-20", "2026-08-22")).toBe(3);
  });

  it("counts across a month boundary", () => {
    expect(countLeaveCalendarDays("2026-08-30", "2026-09-02")).toBe(4);
  });
});
