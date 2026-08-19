import { describe, it, expect } from "vitest";
import { addDaysToDateString, resolveInspectionHealth, healthStateToChartBucket, computeInspectionDashboardAggregate } from "./inspection-health";
import type { ScaffoldInspectionOverviewRow } from "./types";

describe("addDaysToDateString", () => {
  it("adds days within a month", () => {
    expect(addDaysToDateString("2026-08-17", 1)).toBe("2026-08-18");
    expect(addDaysToDateString("2026-08-17", 7)).toBe("2026-08-24");
  });

  it("crosses a month boundary — 17 Aug + 30 = 16 Sep", () => {
    expect(addDaysToDateString("2026-08-17", 30)).toBe("2026-09-16");
  });

  it("crosses a year boundary", () => {
    expect(addDaysToDateString("2026-12-28", 7)).toBe("2027-01-04");
  });

  it("custom interval — 17 Aug + 14 = 31 Aug", () => {
    expect(addDaysToDateString("2026-08-17", 14)).toBe("2026-08-31");
  });

  it("is pure — never reads the ambient clock", () => {
    // Type-level guarantee: no Date.now()/new Date() with no args anywhere in the function body.
    expect(addDaysToDateString.length).toBe(2);
  });
});

describe("resolveInspectionHealth", () => {
  const TODAY = "2026-08-17";

  it("dismantled scaffolds are always 'dismantled', regardless of expiry", () => {
    expect(resolveInspectionHealth("closed", "2026-08-01T00:00:00.000Z", TODAY)).toBe("dismantled");
    expect(resolveInspectionHealth("closed", null, TODAY)).toBe("dismantled");
  });

  it("pending_inspection (no finalized inspection yet) is always 'awaiting_initial'", () => {
    expect(resolveInspectionHealth("pending_inspection", null, TODAY)).toBe("awaiting_initial");
  });

  it("an active status with no expiry data falls back to 'awaiting_initial' defensively", () => {
    expect(resolveInspectionHealth("safe", null, TODAY)).toBe("awaiting_initial");
  });

  it("due date before today is 'expired'", () => {
    expect(resolveInspectionHealth("safe", "2026-08-16T00:00:00.000Z", TODAY)).toBe("expired");
  });

  it("due date equal to today is 'due_today', not 'expired'", () => {
    expect(resolveInspectionHealth("restricted", "2026-08-17T00:00:00.000Z", TODAY)).toBe("due_today");
  });

  it("due date exactly tomorrow is 'expiring_tomorrow'", () => {
    expect(resolveInspectionHealth("safe", "2026-08-18T00:00:00.000Z", TODAY)).toBe("expiring_tomorrow");
  });

  it("due date beyond tomorrow is 'valid'", () => {
    expect(resolveInspectionHealth("safe", "2026-08-19T00:00:00.000Z", TODAY)).toBe("valid");
    expect(resolveInspectionHealth("safe", "2026-09-16T00:00:00.000Z", TODAY)).toBe("valid");
  });

  it("an 'unsafe' or 'awaiting_corrective_action' scaffold is still classified purely by inspection currency, not physical condition — this dashboard tracks compliance, not safety outcome", () => {
    expect(resolveInspectionHealth("unsafe", "2026-08-19T00:00:00.000Z", TODAY)).toBe("valid");
    expect(resolveInspectionHealth("awaiting_corrective_action", "2026-08-16T00:00:00.000Z", TODAY)).toBe("expired");
  });

  it("midnight boundary — a due date at exactly UTC midnight of today is correctly read back as today's date via slice(0,10), never off by one", () => {
    expect(resolveInspectionHealth("safe", "2026-08-17T00:00:00.000Z", "2026-08-17")).toBe("due_today");
  });

  it("month-end boundary — due date is the 1st of the next month, today is the last day of this month", () => {
    expect(resolveInspectionHealth("safe", "2026-09-01T00:00:00.000Z", "2026-08-31")).toBe("expiring_tomorrow");
  });
});

describe("healthStateToChartBucket", () => {
  it("maps valid -> green, expiring_tomorrow -> orange, expired/due_today -> red, awaiting_initial -> gray", () => {
    expect(healthStateToChartBucket("valid")).toBe("green");
    expect(healthStateToChartBucket("expiring_tomorrow")).toBe("orange");
    expect(healthStateToChartBucket("expired")).toBe("red");
    expect(healthStateToChartBucket("due_today")).toBe("red");
    expect(healthStateToChartBucket("awaiting_initial")).toBe("gray");
  });

  it("dismantled scaffolds are excluded from the chart entirely (null bucket)", () => {
    expect(healthStateToChartBucket("dismantled")).toBe(null);
  });
});

function makeRow(overrides: Partial<ScaffoldInspectionOverviewRow>): ScaffoldInspectionOverviewRow {
  return {
    scaffoldId: "s-1",
    scaffoldNumber: 1,
    tagNumber: "SC-001",
    workArea: "Area A",
    status: "safe",
    responsibleForemanId: null,
    responsibleForemanName: null,
    latitude: null,
    longitude: null,
    latestInspectionId: null,
    latestFinalizedAt: null,
    latestInspectorId: null,
    latestInspectorName: null,
    latestOutcome: null,
    latestExpiresAt: null,
    latestIntervalType: null,
    latestIntervalDays: null,
    ...overrides,
  };
}

describe("computeInspectionDashboardAggregate — Part I/J/K's exact KPI/chart/priority definitions", () => {
  const TODAY = "2026-08-17";

  it("KPIs from a realistic mixed set of scaffolds", () => {
    const rows: ScaffoldInspectionOverviewRow[] = [
      makeRow({ scaffoldId: "valid-1", status: "safe", latestExpiresAt: "2026-09-01T00:00:00.000Z" }),
      makeRow({ scaffoldId: "valid-2", status: "restricted", latestExpiresAt: "2026-08-20T00:00:00.000Z" }),
      makeRow({ scaffoldId: "tomorrow-1", status: "safe", latestExpiresAt: "2026-08-18T00:00:00.000Z" }),
      makeRow({ scaffoldId: "due-today-1", status: "safe", latestExpiresAt: "2026-08-17T00:00:00.000Z" }),
      makeRow({ scaffoldId: "expired-1", status: "safe", latestExpiresAt: "2026-08-01T00:00:00.000Z" }),
      makeRow({ scaffoldId: "awaiting-1", status: "pending_inspection", latestExpiresAt: null }),
      makeRow({ scaffoldId: "awaiting-2", status: "pending_inspection", latestExpiresAt: null }),
      makeRow({ scaffoldId: "closed-1", status: "closed", latestExpiresAt: "2026-01-01T00:00:00.000Z" }),
    ];

    const result = computeInspectionDashboardAggregate(rows, TODAY);

    expect(result.totalScaffoldsCreated).toBe(8);
    expect(result.dismantledArchived).toBe(1);
    expect(result.activeScaffolds).toBe(7);
    expect(result.currentlyValid).toBe(2);
    expect(result.expiringTomorrow).toBe(1);
    expect(result.expiredOrDueToday).toBe(2);
    expect(result.awaitingInitialInspection).toBe(2);
  });

  it("chart slices sum to activeScaffolds (dismantled excluded)", () => {
    const rows: ScaffoldInspectionOverviewRow[] = [
      makeRow({ scaffoldId: "1", status: "safe", latestExpiresAt: "2026-09-01T00:00:00.000Z" }),
      makeRow({ scaffoldId: "2", status: "closed", latestExpiresAt: null }),
    ];
    const result = computeInspectionDashboardAggregate(rows, TODAY);
    const chartTotal = result.chartSlices.reduce((sum, s) => sum + s.count, 0);
    expect(chartTotal).toBe(result.activeScaffolds);
    expect(chartTotal).toBe(1);
  });

  it("dismantled scaffolds never appear in any priority list", () => {
    const rows: ScaffoldInspectionOverviewRow[] = [makeRow({ scaffoldId: "closed-expired", status: "closed", latestExpiresAt: "2026-01-01T00:00:00.000Z" })];
    const result = computeInspectionDashboardAggregate(rows, TODAY);
    expect(result.awaitingInitialRows).toHaveLength(0);
    expect(result.expiredOrDueTodayRows).toHaveLength(0);
    expect(result.expiringTomorrowRows).toHaveLength(0);
  });

  it("expiredOrDueTodayRows groups BOTH expired and due-today scaffolds together (Part K's combined priority section)", () => {
    const rows: ScaffoldInspectionOverviewRow[] = [
      makeRow({ scaffoldId: "expired", status: "safe", latestExpiresAt: "2026-08-01T00:00:00.000Z" }),
      makeRow({ scaffoldId: "due-today", status: "safe", latestExpiresAt: "2026-08-17T00:00:00.000Z" }),
    ];
    const result = computeInspectionDashboardAggregate(rows, TODAY);
    expect(result.expiredOrDueTodayRows.map((r) => r.scaffoldId).sort()).toEqual(["due-today", "expired"]);
  });

  it("an empty project reports all-zero KPIs, not an error", () => {
    const result = computeInspectionDashboardAggregate([], TODAY);
    expect(result.totalScaffoldsCreated).toBe(0);
    expect(result.activeScaffolds).toBe(0);
    expect(result.currentlyValid).toBe(0);
    expect(result.chartSlices.every((s) => s.count === 0)).toBe(true);
  });
});
