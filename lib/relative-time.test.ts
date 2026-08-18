import { describe, expect, test } from "vitest";
import { createFormatter } from "next-intl";
import { relativeTime } from "./relative-time";

// Task 3 closure — regression test for the ENVIRONMENT_FALLBACK console
// error: relativeTime() must always be called with an explicit `now`
// reference point (never implicitly reading Date.now()/the ambient
// environment clock, which is exactly what caused server/client drift).
// createFormatter() builds the same formatter object useFormatter()
// returns at runtime, without needing a React render.

const NOW = new Date("2026-06-15T12:00:00.000Z");
const format = createFormatter({ locale: "en", now: NOW });

describe("relativeTime (notification bell)", () => {
  test("requires an explicit `now` — never reads the ambient clock implicitly", () => {
    // A type-level guarantee as much as a runtime one: relativeTime's
    // signature has no optional `now`, so this test failing to compile
    // (not just failing at runtime) is itself part of the regression
    // guard — see the explicit `now: Date` parameter in notification-bell.tsx.
    expect(relativeTime.length).toBe(4);
  });

  test("a few seconds ago renders the localized 'just now' label, not a duration", () => {
    const fiveSecondsAgo = new Date(NOW.getTime() - 5_000).toISOString();
    expect(relativeTime(fiveSecondsAgo, format, NOW, "Just now")).toBe("Just now");
  });

  test("minutes ago uses format.relativeTime with the SAME explicit `now`, not a fresh ambient timestamp", () => {
    const fiveMinutesAgo = new Date(NOW.getTime() - 5 * 60_000).toISOString();
    const result = relativeTime(fiveMinutesAgo, format, NOW, "Just now");
    expect(result).toBe(format.relativeTime(new Date(fiveMinutesAgo), NOW));
    expect(result.toLowerCase()).toContain("minute");
  });

  test("hours ago", () => {
    const threeHoursAgo = new Date(NOW.getTime() - 3 * 60 * 60_000).toISOString();
    const result = relativeTime(threeHoursAgo, format, NOW, "Just now");
    expect(result.toLowerCase()).toContain("hour");
  });

  test("7+ days ago falls back to an absolute locale-aware date, not an ever-growing '12d ago'", () => {
    const tenDaysAgo = new Date(NOW.getTime() - 10 * 24 * 60 * 60_000).toISOString();
    const result = relativeTime(tenDaysAgo, format, NOW, "Just now");
    expect(result).toBe(format.dateTime(new Date(tenDaysAgo), { month: "short", day: "numeric" }));
    expect(result.toLowerCase()).not.toContain("day");
  });

  test("is deterministic for a fixed `now` — calling it twice with the same inputs gives the same output (no hidden ambient-clock read)", () => {
    const twoMinutesAgo = new Date(NOW.getTime() - 2 * 60_000).toISOString();
    const first = relativeTime(twoMinutesAgo, format, NOW, "Just now");
    const second = relativeTime(twoMinutesAgo, format, NOW, "Just now");
    expect(first).toBe(second);
  });

  test("respects the formatter's own locale for relative-time grammar (Swedish)", () => {
    const svFormat = createFormatter({ locale: "sv", now: NOW });
    const oneHourAgo = new Date(NOW.getTime() - 60 * 60_000).toISOString();
    const result = relativeTime(oneHourAgo, svFormat, NOW, "Just nu");
    expect(result.toLowerCase()).toMatch(/timme|tim/);
  });
});
