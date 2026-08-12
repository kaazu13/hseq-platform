import { describe, it, expect } from "vitest";
import { dailyAttendanceStatusTone, SEMANTIC_TONE_BADGE_CLASSES } from "./status-tone";

describe("dailyAttendanceStatusTone — item 12", () => {
  it("maps present to positive (green)", () => {
    expect(dailyAttendanceStatusTone("present")).toBe("positive");
  });

  it("maps absent to negative (red)", () => {
    expect(dailyAttendanceStatusTone("absent")).toBe("negative");
  });

  it("maps sick and leave to attention (orange) — planned/expected, not a failure", () => {
    expect(dailyAttendanceStatusTone("sick")).toBe("attention");
    expect(dailyAttendanceStatusTone("leave")).toBe("attention");
  });

  it("maps training and off_site to neutral (gray)", () => {
    expect(dailyAttendanceStatusTone("training")).toBe("neutral");
    expect(dailyAttendanceStatusTone("off_site")).toBe("neutral");
  });

  it("maps not_set (and any unrecognized value) to neutral, never throwing", () => {
    expect(dailyAttendanceStatusTone("not_set")).toBe("neutral");
    expect(dailyAttendanceStatusTone("something_unexpected")).toBe("neutral");
  });
});

describe("SEMANTIC_TONE_BADGE_CLASSES — item 12: theme-independent", () => {
  it("defines exactly the 5 fixed tones, using literal color classes never the accent-theme CSS variables", () => {
    expect(Object.keys(SEMANTIC_TONE_BADGE_CLASSES).sort()).toEqual(["attention", "info", "negative", "neutral", "positive"].sort());
    for (const classes of Object.values(SEMANTIC_TONE_BADGE_CLASSES)) {
      expect(classes).not.toContain("primary");
      expect(classes).not.toContain("accent");
    }
  });
});
