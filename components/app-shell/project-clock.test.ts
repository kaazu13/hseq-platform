import { describe, expect, test } from "vitest";
import { resolveEffectiveTimezone } from "./project-clock";

// A fixed instant so every assertion below is deterministic regardless of
// when the test suite actually runs — Task 3 closure's "add a
// deterministic timezone test" requirement.
const FIXED_INSTANT = new Date("2026-06-15T12:00:00.000Z"); // June -> CEST/EDT both in DST, avoids seasonal edge cases

describe("resolveEffectiveTimezone (FINAL RULE: project timezone wins whenever one is set)", () => {
  test("returns the project's own timezone when one is set, regardless of the browser's timezone", () => {
    expect(resolveEffectiveTimezone("Europe/Stockholm", "America/New_York")).toBe("Europe/Stockholm");
  });

  test("never falls back to the browser timezone just because it differs from the project's", () => {
    // The exact regression this closure fixes: a project configured for
    // Europe/Stockholm must never resolve to the viewer's own EDT/US
    // timezone.
    const result = resolveEffectiveTimezone("Europe/Stockholm", "America/New_York");
    expect(result).not.toBe("America/New_York");
  });

  test("falls back to the browser timezone only when the project genuinely has none set", () => {
    expect(resolveEffectiveTimezone(null, "America/New_York")).toBe("America/New_York");
  });
});

describe("project-local time formatting is timezone-correct for a fixed instant", () => {
  test("Europe/Stockholm and America/New_York render different wall-clock hours for the same instant", () => {
    const stockholm = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", hour12: false, timeZone: "Europe/Stockholm" }).format(FIXED_INSTANT);
    const newYork = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", hour12: false, timeZone: "America/New_York" }).format(FIXED_INSTANT);
    // 2026-06-15T12:00:00Z -> 14:00 in Stockholm (CEST, UTC+2), 08:00 in
    // New York (EDT, UTC-4) — genuinely different times, not just labels.
    expect(stockholm).toBe("14:00");
    expect(newYork).toBe("08:00");
    expect(stockholm).not.toBe(newYork);
  });

  test("the resolved TEST — Role Validation Project timezone (Europe/Stockholm) never renders as EDT", () => {
    const effective = resolveEffectiveTimezone("Europe/Stockholm", "America/New_York");
    const parts = new Intl.DateTimeFormat("en", { timeZoneName: "short", timeZone: effective }).formatToParts(FIXED_INSTANT);
    const zoneName = parts.find((p) => p.type === "timeZoneName")?.value;
    expect(zoneName).not.toBe("EDT");
    expect(zoneName).not.toBe("EST");
    expect(["CEST", "GMT+2", "UTC+2"]).toContain(zoneName);
  });

  test("language (formatting locale) and project timezone are independent — same instant, same timezone, different locale conventions", () => {
    // en-US defaults to 12-hour with AM/PM; most European locales default
    // to 24-hour — this is exactly "language controls formatting, timezone
    // controls the actual time" as two independent axes.
    const enUs = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Europe/Stockholm" }).format(FIXED_INSTANT);
    const svSe = new Intl.DateTimeFormat("sv-SE", { hour: "numeric", minute: "2-digit", timeZone: "Europe/Stockholm" }).format(FIXED_INSTANT);
    expect(enUs.toUpperCase()).toMatch(/AM|PM/);
    expect(svSe.toUpperCase()).not.toMatch(/AM|PM/);
  });
});
