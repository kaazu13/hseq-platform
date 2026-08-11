import { describe, it, expect } from "vitest";
import { upsertWorkedHoursSchema, bulkApplyWorkedHoursSchema, reportWorkedHoursDiscrepancySchema, resolveWorkedHoursDiscrepancySchema, workedHoursExportQuerySchema } from "./validation";

describe("upsertWorkedHoursSchema", () => {
  it("accepts a valid hours string and transforms it to a number", () => {
    const result = upsertWorkedHoursSchema.safeParse({ hours: "8" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.hours).toBe(8);
  });

  it("accepts the inclusive bounds 0 and 24", () => {
    expect(upsertWorkedHoursSchema.safeParse({ hours: "0" }).success).toBe(true);
    expect(upsertWorkedHoursSchema.safeParse({ hours: "24" }).success).toBe(true);
  });

  it("rejects hours outside 0-24", () => {
    expect(upsertWorkedHoursSchema.safeParse({ hours: "-1" }).success).toBe(false);
    expect(upsertWorkedHoursSchema.safeParse({ hours: "24.5" }).success).toBe(false);
  });

  it("rejects a non-numeric hours value", () => {
    expect(upsertWorkedHoursSchema.safeParse({ hours: "abc" }).success).toBe(false);
  });

  it("rejects a blank hours value", () => {
    expect(upsertWorkedHoursSchema.safeParse({ hours: "" }).success).toBe(false);
  });

  it("allows note/reason to be omitted — reason is only enforced server-side when correcting submitted hours", () => {
    expect(upsertWorkedHoursSchema.safeParse({ hours: "7.5" }).success).toBe(true);
  });
});

describe("bulkApplyWorkedHoursSchema", () => {
  const EMPLOYEE_ID = "123e4567-e89b-42d3-a456-426614174000";

  it("accepts a valid hours value with at least one employee", () => {
    expect(bulkApplyWorkedHoursSchema.safeParse({ hours: "10", employeeIds: [EMPLOYEE_ID] }).success).toBe(true);
  });

  it("rejects an empty employeeIds array — must select at least one employee", () => {
    expect(bulkApplyWorkedHoursSchema.safeParse({ hours: "10", employeeIds: [] }).success).toBe(false);
  });

  it("rejects a non-uuid entry in employeeIds", () => {
    expect(bulkApplyWorkedHoursSchema.safeParse({ hours: "10", employeeIds: ["not-a-uuid"] }).success).toBe(false);
  });

  it("rejects out-of-bounds hours same as upsertWorkedHoursSchema", () => {
    expect(bulkApplyWorkedHoursSchema.safeParse({ hours: "25", employeeIds: [EMPLOYEE_ID] }).success).toBe(false);
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
