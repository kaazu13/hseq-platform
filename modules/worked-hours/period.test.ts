import { describe, it, expect } from "vitest";
import { resolveWorkedHoursPeriod, listPeriodDates, formatWorkedHoursPeriodLabel, buildWorkedHoursFilename } from "./period";

describe("resolveWorkedHoursPeriod", () => {
  it("day mode resolves to the exact selected date", () => {
    const period = resolveWorkedHoursPeriod("day", "2026-08-10");
    expect(period).toEqual({ mode: "day", fromDate: "2026-08-10", toDate: "2026-08-10" });
  });

  it("week mode always resolves Monday through Sunday, regardless of which weekday was selected", () => {
    // 2026-08-10 is a Monday.
    expect(resolveWorkedHoursPeriod("week", "2026-08-10")).toEqual({ mode: "week", fromDate: "2026-08-10", toDate: "2026-08-16" });
    // 2026-08-13 is a Thursday in the same week.
    expect(resolveWorkedHoursPeriod("week", "2026-08-13")).toEqual({ mode: "week", fromDate: "2026-08-10", toDate: "2026-08-16" });
    // 2026-08-16 is the Sunday closing the same week.
    expect(resolveWorkedHoursPeriod("week", "2026-08-16")).toEqual({ mode: "week", fromDate: "2026-08-10", toDate: "2026-08-16" });
  });

  it("month mode resolves the first through the last calendar day of the month", () => {
    expect(resolveWorkedHoursPeriod("month", "2026-08-15")).toEqual({ mode: "month", fromDate: "2026-08-01", toDate: "2026-08-31" });
    // February in a leap year.
    expect(resolveWorkedHoursPeriod("month", "2028-02-10")).toEqual({ mode: "month", fromDate: "2028-02-01", toDate: "2028-02-29" });
  });
});

describe("listPeriodDates", () => {
  it("enumerates every calendar date inside the period, never one outside it", () => {
    expect(listPeriodDates({ mode: "week", fromDate: "2026-08-10", toDate: "2026-08-16" })).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
    ]);
  });
});

describe("formatWorkedHoursPeriodLabel", () => {
  it("formats a day period as a single date", () => {
    expect(formatWorkedHoursPeriodLabel({ mode: "day", fromDate: "2026-08-10", toDate: "2026-08-10" })).toBe("10 Aug 2026");
  });

  it("formats a week/month period as a from–to range", () => {
    expect(formatWorkedHoursPeriodLabel({ mode: "week", fromDate: "2026-08-10", toDate: "2026-08-16" })).toBe("10 Aug 2026 – 16 Aug 2026");
    expect(formatWorkedHoursPeriodLabel({ mode: "month", fromDate: "2026-08-01", toDate: "2026-08-31" })).toBe("01 Aug 2026 – 31 Aug 2026");
  });
});

describe("buildWorkedHoursFilename", () => {
  it("matches the milestone's exact examples for each mode", () => {
    expect(buildWorkedHoursFilename("North Plant Expansion", { mode: "day", fromDate: "2026-08-10", toDate: "2026-08-10" })).toBe("North Plant Expansion - Worked Hours - 2026-08-10.xlsx");
    expect(buildWorkedHoursFilename("North Plant Expansion", { mode: "week", fromDate: "2026-08-10", toDate: "2026-08-16" })).toBe("North Plant Expansion - Worked Hours - Week 33 - 2026.xlsx");
    expect(buildWorkedHoursFilename("North Plant Expansion", { mode: "month", fromDate: "2026-08-01", toDate: "2026-08-31" })).toBe("North Plant Expansion - Worked Hours - August 2026.xlsx");
  });

  it("sanitizes a project name containing filesystem-unsafe characters without stripping spaces", () => {
    const filename = buildWorkedHoursFilename('North / Plant: "Expansion"', { mode: "day", fromDate: "2026-08-10", toDate: "2026-08-10" });
    expect(filename).toBe("North Plant Expansion - Worked Hours - 2026-08-10.xlsx");
  });
});
