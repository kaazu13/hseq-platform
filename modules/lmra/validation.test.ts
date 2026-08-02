import { describe, it, expect } from "vitest";
import {
  lmraAssessmentFormSchema,
  lmraHazardSchema,
  lmraHazardsFormSchema,
  lmraParticipantsFormSchema,
  lmraReviewFormSchema,
  lmraSubmitFormSchema,
} from "./validation";
import { LMRA_HAZARD_TYPES } from "./types";

// zod's .uuid() validates the version/variant nibbles, not just the
// hyphenation shape — an all-zero placeholder like
// "00000000-0000-0000-0000-000000000001" fails it (version nibble '0' isn't
// a real UUID version), so these fixtures use valid-shaped v4 UUIDs.
const VALID_ASSESSMENT_INPUT = {
  projectId: "123e4567-e89b-42d3-a456-426614174000",
  workArea: "Scaffold bay 3",
  workActivity: "Erecting tube-and-clip scaffold",
  workDate: "2026-08-01",
  shift: "Day",
  responsibleForemanId: "123e4567-e89b-42d3-a456-426614174001",
  notes: "",
};

function validHazardRow(hazardType: (typeof LMRA_HAZARD_TYPES)[number]) {
  return lmraHazardSchema.parse({
    hazardType,
    isApplicable: true,
    controls: "Guardrails installed",
    responsiblePersonId: null,
    controlsConfirmed: true,
    otherDescription: "",
  });
}

describe("lmraAssessmentFormSchema", () => {
  it("accepts a fully populated valid input", () => {
    expect(lmraAssessmentFormSchema.safeParse(VALID_ASSESSMENT_INPUT).success).toBe(true);
  });

  it("rejects a non-uuid projectId/responsibleForemanId", () => {
    expect(lmraAssessmentFormSchema.safeParse({ ...VALID_ASSESSMENT_INPUT, projectId: "not-a-uuid" }).success).toBe(false);
    expect(lmraAssessmentFormSchema.safeParse({ ...VALID_ASSESSMENT_INPUT, responsibleForemanId: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects blank work area/work activity/shift", () => {
    expect(lmraAssessmentFormSchema.safeParse({ ...VALID_ASSESSMENT_INPUT, workArea: "  " }).success).toBe(false);
    expect(lmraAssessmentFormSchema.safeParse({ ...VALID_ASSESSMENT_INPUT, workActivity: "" }).success).toBe(false);
    expect(lmraAssessmentFormSchema.safeParse({ ...VALID_ASSESSMENT_INPUT, shift: "" }).success).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(lmraAssessmentFormSchema.safeParse({ ...VALID_ASSESSMENT_INPUT, workDate: "08/01/2026" }).success).toBe(false);
    expect(lmraAssessmentFormSchema.safeParse({ ...VALID_ASSESSMENT_INPUT, workDate: "" }).success).toBe(false);
  });

  it("allows notes to be empty", () => {
    expect(lmraAssessmentFormSchema.safeParse({ ...VALID_ASSESSMENT_INPUT, notes: "" }).success).toBe(true);
  });
});

describe("lmraHazardsFormSchema", () => {
  it("accepts exactly 12 rows, one per LMRA_HAZARD_TYPES entry", () => {
    const rows = LMRA_HAZARD_TYPES.map((hazardType) => validHazardRow(hazardType));
    expect(lmraHazardsFormSchema.safeParse(rows).success).toBe(true);
  });

  it("rejects fewer than 12 rows", () => {
    const rows = LMRA_HAZARD_TYPES.slice(0, 11).map((hazardType) => validHazardRow(hazardType));
    expect(lmraHazardsFormSchema.safeParse(rows).success).toBe(false);
  });

  it("rejects more than 12 rows", () => {
    const rows = [...LMRA_HAZARD_TYPES, "working_at_height"].map((hazardType) => validHazardRow(hazardType as (typeof LMRA_HAZARD_TYPES)[number]));
    expect(lmraHazardsFormSchema.safeParse(rows).success).toBe(false);
  });

  it("rejects a hazard type outside the fixed 12-item vocabulary", () => {
    expect(
      lmraHazardSchema.safeParse({
        hazardType: "not_a_real_hazard",
        isApplicable: true,
        controls: "",
        responsiblePersonId: null,
        controlsConfirmed: false,
        otherDescription: "",
      }).success,
    ).toBe(false);
  });
});

describe("lmraParticipantsFormSchema", () => {
  it("accepts an array of uuids, including an empty array", () => {
    expect(lmraParticipantsFormSchema.safeParse([]).success).toBe(true);
    expect(lmraParticipantsFormSchema.safeParse(["123e4567-e89b-42d3-a456-426614174000"]).success).toBe(true);
  });

  it("rejects a non-uuid entry", () => {
    expect(lmraParticipantsFormSchema.safeParse(["not-a-uuid"]).success).toBe(false);
  });
});

describe("lmraReviewFormSchema", () => {
  it("accepts approved/rejected decisions", () => {
    expect(lmraReviewFormSchema.safeParse({ decision: "approved", reviewNotes: "" }).success).toBe(true);
    expect(lmraReviewFormSchema.safeParse({ decision: "rejected", reviewNotes: "Missing fall protection detail" }).success).toBe(true);
  });

  it("rejects any other decision value", () => {
    expect(lmraReviewFormSchema.safeParse({ decision: "pending", reviewNotes: "" }).success).toBe(false);
  });
});

describe("lmraSubmitFormSchema", () => {
  it("accepts a go decision with no stop-work reason", () => {
    expect(lmraSubmitFormSchema.safeParse({ result: "go", stopWorkReason: "" }).success).toBe(true);
  });

  it("accepts a no_go decision WITH a stop-work reason", () => {
    expect(lmraSubmitFormSchema.safeParse({ result: "no_go", stopWorkReason: "Unsafe wind conditions" }).success).toBe(true);
  });

  it("rejects a no_go decision with a blank stop-work reason — the crew must record why work stopped", () => {
    const result = lmraSubmitFormSchema.safeParse({ result: "no_go", stopWorkReason: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.stopWorkReason).toBeTruthy();
    }
  });

  it("rejects a no_go decision with only whitespace as the reason", () => {
    expect(lmraSubmitFormSchema.safeParse({ result: "no_go", stopWorkReason: "   " }).success).toBe(false);
  });
});
