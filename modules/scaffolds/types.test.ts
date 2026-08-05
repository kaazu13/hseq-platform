import { describe, it, expect } from "vitest";
import { getScaffoldDisplayStatus, SCAFFOLD_INSPECTION_EXPIRING_SOON_DAYS, formatScaffoldDimensions, SCAFFOLD_TEAM_MIN_SIZE, SCAFFOLD_TEAM_MAX_SIZE } from "./types";

const NOW = new Date("2026-08-10T12:00:00.000Z");

function daysFromNow(days: number): string {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

describe("getScaffoldDisplayStatus", () => {
  it("never overrides unsafe/closed/pending_inspection regardless of expiry", () => {
    expect(getScaffoldDisplayStatus("unsafe", daysFromNow(-10), NOW)).toBe("unsafe");
    expect(getScaffoldDisplayStatus("closed", daysFromNow(-10), NOW)).toBe("closed");
    expect(getScaffoldDisplayStatus("pending_inspection", null, NOW)).toBe("pending_inspection");
  });

  it("shows the stored status as-is when there's no current inspection expiry to check", () => {
    expect(getScaffoldDisplayStatus("safe", null, NOW)).toBe("safe");
  });

  it("shows the stored status as-is when the inspection is comfortably still valid", () => {
    expect(getScaffoldDisplayStatus("safe", daysFromNow(10), NOW)).toBe("safe");
    expect(getScaffoldDisplayStatus("restricted", daysFromNow(10), NOW)).toBe("restricted");
  });

  it(`overrides to 'expiring_soon' within ${SCAFFOLD_INSPECTION_EXPIRING_SOON_DAYS} days of expiry, for both safe and restricted`, () => {
    expect(getScaffoldDisplayStatus("safe", daysFromNow(1), NOW)).toBe("expiring_soon");
    expect(getScaffoldDisplayStatus("restricted", daysFromNow(SCAFFOLD_INSPECTION_EXPIRING_SOON_DAYS), NOW)).toBe("expiring_soon");
    expect(getScaffoldDisplayStatus("awaiting_corrective_action", daysFromNow(1), NOW)).toBe("expiring_soon");
  });

  it("does NOT yet show expiring_soon just outside the threshold", () => {
    expect(getScaffoldDisplayStatus("safe", daysFromNow(SCAFFOLD_INSPECTION_EXPIRING_SOON_DAYS + 1), NOW)).toBe("safe");
  });

  it("overrides to 'expired' once the current inspection's expiry has passed — 'a scaffold must not display a valid current status based on an expired inspection'", () => {
    expect(getScaffoldDisplayStatus("safe", daysFromNow(-1), NOW)).toBe("expired");
    expect(getScaffoldDisplayStatus("restricted", daysFromNow(-100), NOW)).toBe("expired");
  });

  it("treats an expiry of exactly now as already expired", () => {
    expect(getScaffoldDisplayStatus("safe", NOW.toISOString(), NOW)).toBe("expired");
  });
});

describe("formatScaffoldDimensions", () => {
  it("formats all three dimensions as '<H> m H × <L> m L × <W> m W'", () => {
    expect(formatScaffoldDimensions({ height_metres: 5.7, length_metres: 12, width_metres: 1.2 })).toBe("5.70 m H × 12.00 m L × 1.20 m W");
  });

  it("omits whichever dimensions aren't recorded rather than showing a placeholder", () => {
    expect(formatScaffoldDimensions({ height_metres: 5.7, length_metres: null, width_metres: null })).toBe("5.70 m H");
    expect(formatScaffoldDimensions({ height_metres: null, length_metres: 12, width_metres: null })).toBe("12.00 m L");
    expect(formatScaffoldDimensions({ height_metres: null, length_metres: null, width_metres: 1.2 })).toBe("1.20 m W");
    expect(formatScaffoldDimensions({ height_metres: 5.7, length_metres: 12, width_metres: null })).toBe("5.70 m H × 12.00 m L");
  });

  it("returns null when no dimensions are recorded, so callers can render their own empty state", () => {
    expect(formatScaffoldDimensions({ height_metres: null, length_metres: null, width_metres: null })).toBeNull();
  });

  it("always shows exactly two decimal places regardless of stored precision", () => {
    expect(formatScaffoldDimensions({ height_metres: 5, length_metres: null, width_metres: null })).toBe("5.00 m H");
  });
});

describe("scaffold team size bounds", () => {
  it("documents the suggested minimum and maximum team size", () => {
    expect(SCAFFOLD_TEAM_MIN_SIZE).toBe(1);
    expect(SCAFFOLD_TEAM_MAX_SIZE).toBe(50);
  });
});
