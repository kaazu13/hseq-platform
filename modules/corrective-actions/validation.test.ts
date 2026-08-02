import { describe, it, expect } from "vitest";
import {
  correctiveActionFormSchema,
  correctiveActionProgressFormSchema,
  correctiveActionCloseFormSchema,
  correctiveActionReasonFormSchema,
} from "./validation";

const VALID_FORM_INPUT = {
  description: "Install missing guardrail on level 3 platform",
  responsiblePersonId: "123e4567-e89b-42d3-a456-426614174000",
  priority: "high",
  dueDate: "2026-08-10",
};

describe("correctiveActionFormSchema", () => {
  it("accepts a fully populated valid input", () => {
    expect(correctiveActionFormSchema.safeParse(VALID_FORM_INPUT).success).toBe(true);
  });

  it("rejects a blank description", () => {
    expect(correctiveActionFormSchema.safeParse({ ...VALID_FORM_INPUT, description: "   " }).success).toBe(false);
  });

  it("rejects a non-uuid responsiblePersonId", () => {
    expect(correctiveActionFormSchema.safeParse({ ...VALID_FORM_INPUT, responsiblePersonId: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects a priority outside low/medium/high/critical", () => {
    expect(correctiveActionFormSchema.safeParse({ ...VALID_FORM_INPUT, priority: "urgent" }).success).toBe(false);
  });

  it("rejects a malformed due date", () => {
    expect(correctiveActionFormSchema.safeParse({ ...VALID_FORM_INPUT, dueDate: "10/08/2026" }).success).toBe(false);
  });
});

describe("correctiveActionProgressFormSchema", () => {
  it("accepts open/in_progress/awaiting_verification", () => {
    for (const status of ["open", "in_progress", "awaiting_verification"]) {
      expect(correctiveActionProgressFormSchema.safeParse({ status, completionNotes: "" }).success).toBe(true);
    }
  });

  it("rejects closed/rejected — the progress endpoint's schema itself cannot express a direct close/reject, matching validate_corrective_action_update()'s Employee restriction at the database level", () => {
    expect(correctiveActionProgressFormSchema.safeParse({ status: "closed", completionNotes: "" }).success).toBe(false);
    expect(correctiveActionProgressFormSchema.safeParse({ status: "rejected", completionNotes: "" }).success).toBe(false);
  });
});

describe("correctiveActionCloseFormSchema", () => {
  it("allows empty closure evidence — optional, and there's no file-upload path yet (see the migration's header comment)", () => {
    expect(correctiveActionCloseFormSchema.safeParse({ closureEvidence: "" }).success).toBe(true);
  });

  it("accepts a populated closure evidence description", () => {
    expect(correctiveActionCloseFormSchema.safeParse({ closureEvidence: "Photo taken on-site confirming guardrail installed" }).success).toBe(true);
  });
});

describe("correctiveActionReasonFormSchema", () => {
  it("accepts a populated reason — used for both rejecting and reopening (this milestone's explicit requirement: both need a reason)", () => {
    expect(correctiveActionReasonFormSchema.safeParse({ reason: "Guardrail installed does not meet spec" }).success).toBe(true);
  });

  it("rejects a blank reason", () => {
    expect(correctiveActionReasonFormSchema.safeParse({ reason: "" }).success).toBe(false);
  });

  it("rejects a whitespace-only reason", () => {
    expect(correctiveActionReasonFormSchema.safeParse({ reason: "   " }).success).toBe(false);
  });
});
