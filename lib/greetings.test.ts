import { describe, it, expect } from "vitest";
import { computeEasterSunday, getDueFixedGreetingTypes } from "./greetings";

describe("computeEasterSunday", () => {
  it("matches well-known Easter Sunday dates", () => {
    expect(computeEasterSunday(2024).toISOString().slice(0, 10)).toBe("2024-03-31");
    expect(computeEasterSunday(2025).toISOString().slice(0, 10)).toBe("2025-04-20");
    expect(computeEasterSunday(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(computeEasterSunday(2027).toISOString().slice(0, 10)).toBe("2027-03-28");
  });
});

describe("getDueFixedGreetingTypes", () => {
  it("returns christmas on December 25", () => {
    expect(getDueFixedGreetingTypes(new Date(Date.UTC(2026, 11, 25)))).toEqual(["christmas"]);
  });

  it("returns new_year on January 1", () => {
    expect(getDueFixedGreetingTypes(new Date(Date.UTC(2026, 0, 1)))).toEqual(["new_year"]);
  });

  it("returns easter on the computed Easter Sunday", () => {
    expect(getDueFixedGreetingTypes(new Date(Date.UTC(2026, 3, 5)))).toEqual(["easter"]);
  });

  it("returns an empty array on an ordinary day", () => {
    expect(getDueFixedGreetingTypes(new Date(Date.UTC(2026, 5, 15)))).toEqual([]);
  });

  it("never returns more than one fixed type unless dates genuinely coincide", () => {
    const due = getDueFixedGreetingTypes(new Date(Date.UTC(2026, 11, 25)));
    expect(due.length).toBe(1);
  });
});
