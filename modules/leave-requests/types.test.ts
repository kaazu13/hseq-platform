import { describe, it, expect } from "vitest";
import { countLeaveCalendarDays } from "./types";

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
