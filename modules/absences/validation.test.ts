import { describe, it, expect } from "vitest";
import { reportAbsenceSchema, rejectAbsenceReportSchema, reopenAbsenceDaySchema, correctAbsenceStatusSchema } from "./validation";

describe("reportAbsenceSchema", () => {
  it("accepts a valid self-report", () => {
    const result = reportAbsenceSchema.safeParse({ workDate: "2026-08-13", reason: "sick", comment: "Feeling unwell" });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed date", () => {
    expect(reportAbsenceSchema.safeParse({ workDate: "13-08-2026", reason: "sick" }).success).toBe(false);
  });

  it("rejects a reason outside the controlled list", () => {
    expect(reportAbsenceSchema.safeParse({ workDate: "2026-08-13", reason: "vacation" }).success).toBe(false);
  });

  it("allows the comment to be omitted", () => {
    expect(reportAbsenceSchema.safeParse({ workDate: "2026-08-13", reason: "other" }).success).toBe(true);
  });
});

describe("rejectAbsenceReportSchema", () => {
  it("requires a non-blank review note", () => {
    expect(rejectAbsenceReportSchema.safeParse({ reviewNote: "Not consistent with the roster" }).success).toBe(true);
    expect(rejectAbsenceReportSchema.safeParse({ reviewNote: "" }).success).toBe(false);
    expect(rejectAbsenceReportSchema.safeParse({ reviewNote: "   " }).success).toBe(false);
  });
});

describe("reopenAbsenceDaySchema", () => {
  it("requires a non-blank reason", () => {
    expect(reopenAbsenceDaySchema.safeParse({ reason: "Foreman submitted a late correction" }).success).toBe(true);
    expect(reopenAbsenceDaySchema.safeParse({ reason: "" }).success).toBe(false);
  });
});

describe("correctAbsenceStatusSchema", () => {
  it("accepts a status change with no reason — free edit on an open day, enforced server-side only when closed", () => {
    const result = correctAbsenceStatusSchema.safeParse({ status: "absent", note: undefined, reason: undefined });
    expect(result.success).toBe(true);
  });

  it("rejects a status outside the controlled enum", () => {
    expect(correctAbsenceStatusSchema.safeParse({ status: "on_leave", note: undefined, reason: undefined }).success).toBe(false);
  });
});
