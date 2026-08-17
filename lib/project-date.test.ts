import { describe, it, expect } from "vitest";
import { getProjectLocalDate } from "./project-date";

describe("getProjectLocalDate", () => {
  it("falls back to UTC when no timezone is set", () => {
    const reference = new Date("2026-08-17T23:30:00Z");
    expect(getProjectLocalDate(null, reference)).toBe("2026-08-17");
    expect(getProjectLocalDate(undefined, reference)).toBe("2026-08-17");
  });

  it("returns the project-local calendar date, which can differ from UTC's", () => {
    // 23:30 UTC is already the next day in Tokyo (UTC+9).
    const reference = new Date("2026-08-17T23:30:00Z");
    expect(getProjectLocalDate("Asia/Tokyo", reference)).toBe("2026-08-18");
  });

  it("returns the previous UTC day for a negative-offset timezone near midnight UTC", () => {
    // 00:30 UTC is still the previous day in New York (UTC-4/-5).
    const reference = new Date("2026-08-17T00:30:00Z");
    expect(getProjectLocalDate("America/New_York", reference)).toBe("2026-08-16");
  });

  it("falls back to UTC for an invalid/unrecognized timezone string rather than throwing", () => {
    const reference = new Date("2026-08-17T12:00:00Z");
    expect(getProjectLocalDate("Not/A_Real_Zone", reference)).toBe("2026-08-17");
  });
});
