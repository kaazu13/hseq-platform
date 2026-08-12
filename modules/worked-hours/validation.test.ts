import { describe, it, expect } from "vitest";
import { upsertWorkedHoursCategoriesSchema, bulkApplyWorkedHoursSchema, reportWorkedHoursDiscrepancySchema, resolveWorkedHoursDiscrepancySchema, workedHoursExportQuerySchema } from "./validation";

const ZERO_CATEGORIES = { regular: "0", overtime: "0", night: "0", travel: "0", other: "0" };

describe("upsertWorkedHoursCategoriesSchema", () => {
  it("accepts a valid category breakdown and transforms each value to a number", () => {
    const result = upsertWorkedHoursCategoriesSchema.safeParse({ categories: { ...ZERO_CATEGORIES, regular: "8", overtime: "2" } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.categories.regular).toBe(8);
      expect(result.data.categories.overtime).toBe(2);
    }
  });

  it("treats a blank category field as 0, not an error", () => {
    const result = upsertWorkedHoursCategoriesSchema.safeParse({ categories: { ...ZERO_CATEGORIES, regular: "" } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.categories.regular).toBe(0);
  });

  it("rejects a single category value outside 0-24", () => {
    expect(upsertWorkedHoursCategoriesSchema.safeParse({ categories: { ...ZERO_CATEGORIES, regular: "-1" } }).success).toBe(false);
    expect(upsertWorkedHoursCategoriesSchema.safeParse({ categories: { ...ZERO_CATEGORIES, regular: "24.5" } }).success).toBe(false);
  });

  it("rejects a non-numeric category value", () => {
    expect(upsertWorkedHoursCategoriesSchema.safeParse({ categories: { ...ZERO_CATEGORIES, regular: "abc" } }).success).toBe(false);
  });

  it("rejects a total across all categories exceeding 24.0 — the critical invariant", () => {
    const result = upsertWorkedHoursCategoriesSchema.safeParse({ categories: { regular: "20", overtime: "10", night: "0", travel: "0", other: "0" } });
    expect(result.success).toBe(false);
  });

  it("accepts a total of exactly 24.0", () => {
    const result = upsertWorkedHoursCategoriesSchema.safeParse({ categories: { regular: "20", overtime: "4", night: "0", travel: "0", other: "0" } });
    expect(result.success).toBe(true);
  });

  it("allows note/reason to be omitted — reason is only enforced server-side when correcting submitted hours", () => {
    expect(upsertWorkedHoursCategoriesSchema.safeParse({ categories: { ...ZERO_CATEGORIES, regular: "7.5" } }).success).toBe(true);
  });
});

describe("bulkApplyWorkedHoursSchema", () => {
  const EMPLOYEE_ID = "123e4567-e89b-42d3-a456-426614174000";

  it("accepts a valid category/hours value with at least one employee", () => {
    expect(bulkApplyWorkedHoursSchema.safeParse({ category: "regular", hours: "10", employeeIds: [EMPLOYEE_ID] }).success).toBe(true);
  });

  it("rejects a category outside the fixed list", () => {
    expect(bulkApplyWorkedHoursSchema.safeParse({ category: "vacation", hours: "10", employeeIds: [EMPLOYEE_ID] }).success).toBe(false);
  });

  it("rejects an empty employeeIds array — must select at least one employee", () => {
    expect(bulkApplyWorkedHoursSchema.safeParse({ category: "regular", hours: "10", employeeIds: [] }).success).toBe(false);
  });

  it("rejects a non-uuid entry in employeeIds", () => {
    expect(bulkApplyWorkedHoursSchema.safeParse({ category: "regular", hours: "10", employeeIds: ["not-a-uuid"] }).success).toBe(false);
  });

  it("rejects out-of-bounds hours", () => {
    expect(bulkApplyWorkedHoursSchema.safeParse({ category: "regular", hours: "25", employeeIds: [EMPLOYEE_ID] }).success).toBe(false);
  });
});

describe("reportWorkedHoursDiscrepancySchema", () => {
  it("requires a non-blank comment", () => {
    expect(reportWorkedHoursDiscrepancySchema.safeParse({ comment: "Hours look wrong for Tuesday" }).success).toBe(true);
    expect(reportWorkedHoursDiscrepancySchema.safeParse({ comment: "" }).success).toBe(false);
    expect(reportWorkedHoursDiscrepancySchema.safeParse({ comment: "   " }).success).toBe(false);
  });
});

describe("resolveWorkedHoursDiscrepancySchema", () => {
  it("accepts status=accepted with a resolution note and no resultingHours", () => {
    const result = resolveWorkedHoursDiscrepancySchema.safeParse({ status: "accepted", resolutionNote: "Confirmed with foreman" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.resultingHours).toBeUndefined();
  });

  it("accepts status=rejected with a resultingHours correction, transformed to a number", () => {
    const result = resolveWorkedHoursDiscrepancySchema.safeParse({ status: "rejected", resolutionNote: "Corrected to actual hours", resultingHours: "7.5" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.resultingHours).toBe(7.5);
  });

  it("rejects a status outside accepted/rejected", () => {
    expect(resolveWorkedHoursDiscrepancySchema.safeParse({ status: "pending", resolutionNote: "note" }).success).toBe(false);
  });

  it("requires a non-blank resolutionNote", () => {
    expect(resolveWorkedHoursDiscrepancySchema.safeParse({ status: "accepted", resolutionNote: "" }).success).toBe(false);
  });

  it("rejects an out-of-bounds resultingHours", () => {
    expect(resolveWorkedHoursDiscrepancySchema.safeParse({ status: "rejected", resolutionNote: "note", resultingHours: "30" }).success).toBe(false);
  });
});

describe("workedHoursExportQuerySchema", () => {
  const EMPLOYEE_ID = "123e4567-e89b-42d3-a456-426614174000";

  it("accepts a plain day export with no employeeIds", () => {
    const result = workedHoursExportQuerySchema.safeParse({ mode: "day", date: "2026-08-10", scope: "hours_only" });
    expect(result.success).toBe(true);
  });

  it("falls back to day/hours_only for an unrecognized mode or scope, rather than rejecting the request", () => {
    const result = workedHoursExportQuerySchema.safeParse({ mode: "year", date: "2026-08-10", scope: "everyone" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe("day");
      expect(result.data.scope).toBe("hours_only");
    }
  });

  it("rejects a malformed date", () => {
    expect(workedHoursExportQuerySchema.safeParse({ mode: "day", date: "10-08-2026", scope: "hours_only" }).success).toBe(false);
  });

  it("requires at least one employeeId when scope=selected", () => {
    expect(workedHoursExportQuerySchema.safeParse({ mode: "day", date: "2026-08-10", scope: "selected" }).success).toBe(false);
    expect(workedHoursExportQuerySchema.safeParse({ mode: "day", date: "2026-08-10", scope: "selected", employeeIds: [] }).success).toBe(false);
    expect(workedHoursExportQuerySchema.safeParse({ mode: "day", date: "2026-08-10", scope: "selected", employeeIds: [EMPLOYEE_ID] }).success).toBe(true);
  });

  it("rejects a non-uuid entry in employeeIds", () => {
    expect(workedHoursExportQuerySchema.safeParse({ mode: "day", date: "2026-08-10", scope: "selected", employeeIds: ["not-a-uuid"] }).success).toBe(false);
  });

  it("does not require employeeIds for all_workers/hours_only scopes", () => {
    expect(workedHoursExportQuerySchema.safeParse({ mode: "week", date: "2026-08-10", scope: "all_workers" }).success).toBe(true);
  });
});
