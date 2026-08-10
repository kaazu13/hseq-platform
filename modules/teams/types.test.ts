import { describe, it, expect } from "vitest";
import { formatTeamScheduleSummary } from "./types";

describe("formatTeamScheduleSummary", () => {
  it("joins shift, work area, and a full active date range with a middot", () => {
    expect(formatTeamScheduleSummary({ shift: "Day", work_area: "North wing", active_from: "2026-08-12", active_until: "2026-09-30" })).toBe("Day · North wing · Aug 12, 2026 – Sep 30, 2026");
  });

  it("omits whichever parts aren't recorded rather than showing a placeholder", () => {
    expect(formatTeamScheduleSummary({ shift: "Night", work_area: null, active_from: null, active_until: null })).toBe("Night");
    expect(formatTeamScheduleSummary({ shift: null, work_area: "Dock 3", active_from: null, active_until: null })).toBe("Dock 3");
  });

  it("shows an open-ended 'From <date>' when only active_from is set", () => {
    expect(formatTeamScheduleSummary({ shift: null, work_area: null, active_from: "2026-08-12", active_until: null })).toBe("From Aug 12, 2026");
  });

  it("shows an open-started 'Until <date>' when only active_until is set", () => {
    expect(formatTeamScheduleSummary({ shift: null, work_area: null, active_from: null, active_until: "2026-09-30" })).toBe("Until Sep 30, 2026");
  });

  it("returns null when nothing is recorded, so callers render nothing instead of an empty line", () => {
    expect(formatTeamScheduleSummary({ shift: null, work_area: null, active_from: null, active_until: null })).toBeNull();
  });
});
