import { describe, it, expect } from "vitest";
import { scaffoldDefectFormSchema, scaffoldDefectProgressFormSchema, scaffoldDefectCloseFormSchema, scaffoldDefectReasonFormSchema } from "./validation";

const VALID_INPUT = {
  description: "Missing toe board on level 2 platform",
  severity: "high",
  responsiblePersonId: "123e4567-e89b-42d3-a456-426614174000",
  dueDate: "2026-08-15",
  immediateControl: "",
  inspectionItemId: "",
};

describe("scaffoldDefectFormSchema", () => {
  it("accepts a fully populated valid input", () => {
    expect(scaffoldDefectFormSchema.safeParse(VALID_INPUT).success).toBe(true);
  });

  it("rejects a blank description", () => {
    expect(scaffoldDefectFormSchema.safeParse({ ...VALID_INPUT, description: "   " }).success).toBe(false);
  });

  it("rejects a non-uuid responsiblePersonId", () => {
    expect(scaffoldDefectFormSchema.safeParse({ ...VALID_INPUT, responsiblePersonId: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects a severity outside low/medium/high/critical", () => {
    expect(scaffoldDefectFormSchema.safeParse({ ...VALID_INPUT, severity: "extreme" }).success).toBe(false);
  });

  it("rejects a malformed due date", () => {
    expect(scaffoldDefectFormSchema.safeParse({ ...VALID_INPUT, dueDate: "15/08/2026" }).success).toBe(false);
  });

  it("allows inspectionItemId to be omitted — a defect can be raised freeform, not only from a checklist row", () => {
    const result = scaffoldDefectFormSchema.safeParse({ ...VALID_INPUT, inspectionItemId: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.inspectionItemId).toBeUndefined();
  });

  it("rejects an oversized description (Phase 11 input-limit audit)", () => {
    expect(scaffoldDefectFormSchema.safeParse({ ...VALID_INPUT, description: "a".repeat(2001) }).success).toBe(false);
  });
});

describe("scaffoldDefectProgressFormSchema", () => {
  it("accepts open/in_progress/awaiting_verification", () => {
    for (const status of ["open", "in_progress", "awaiting_verification"]) {
      expect(scaffoldDefectProgressFormSchema.safeParse({ status, completionNotes: "" }).success).toBe(true);
    }
  });

  it("rejects closed/rejected — the progress endpoint cannot express a direct close/reject", () => {
    expect(scaffoldDefectProgressFormSchema.safeParse({ status: "closed", completionNotes: "" }).success).toBe(false);
    expect(scaffoldDefectProgressFormSchema.safeParse({ status: "rejected", completionNotes: "" }).success).toBe(false);
  });
});

describe("scaffoldDefectCloseFormSchema", () => {
  it("allows empty verification notes — optional", () => {
    expect(scaffoldDefectCloseFormSchema.safeParse({ verificationNotes: "" }).success).toBe(true);
  });
});

describe("scaffoldDefectReasonFormSchema", () => {
  it("accepts a populated reason — used for both rejecting and reopening", () => {
    expect(scaffoldDefectReasonFormSchema.safeParse({ reason: "Repair does not meet spec" }).success).toBe(true);
  });

  it("rejects a blank or whitespace-only reason", () => {
    expect(scaffoldDefectReasonFormSchema.safeParse({ reason: "" }).success).toBe(false);
    expect(scaffoldDefectReasonFormSchema.safeParse({ reason: "   " }).success).toBe(false);
  });

  it("rejects an oversized reason (Phase 11 input-limit audit)", () => {
    expect(scaffoldDefectReasonFormSchema.safeParse({ reason: "a".repeat(2001) }).success).toBe(false);
  });
});
