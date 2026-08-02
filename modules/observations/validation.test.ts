import { describe, it, expect } from "vitest";
import { observationFormSchema, observationParticipantsFormSchema } from "./validation";

// See modules/lmra/validation.test.ts's fixture comment — zod's .uuid()
// validates the version/variant nibbles, not just hyphenation shape, so
// these use valid-shaped v4 UUIDs rather than all-zero placeholders.
const VALID_INPUT = {
  projectId: "123e4567-e89b-42d3-a456-426614174000",
  workArea: "Scaffold bay 2",
  observedAt: "2026-08-02T14:30",
  observerId: "123e4567-e89b-42d3-a456-426614174001",
  category: "unsafe_condition",
  description: "Guardrail missing on level 3 platform",
  immediateActionTaken: "Cordoned off the area and notified the foreman",
  riskLevel: "high",
  isStopWork: false,
} as const;

describe("observationFormSchema", () => {
  it("accepts a fully populated valid input", () => {
    expect(observationFormSchema.safeParse(VALID_INPUT).success).toBe(true);
  });

  it("accepts every one of the 13 fixed categories", () => {
    const categories = [
      "positive_observation",
      "unsafe_act",
      "unsafe_condition",
      "line_of_fire",
      "working_at_height",
      "falling_objects",
      "material_handling",
      "housekeeping",
      "tools_equipment",
      "mobile_equipment_mewp",
      "access_egress",
      "ppe",
      "other",
    ];
    for (const category of categories) {
      expect(observationFormSchema.safeParse({ ...VALID_INPUT, category }).success).toBe(true);
    }
  });

  it("rejects a category outside the fixed list", () => {
    expect(observationFormSchema.safeParse({ ...VALID_INPUT, category: "near_miss" }).success).toBe(false);
  });

  it("rejects a risk level outside low/medium/high/critical", () => {
    expect(observationFormSchema.safeParse({ ...VALID_INPUT, riskLevel: "severe" }).success).toBe(false);
  });

  it("rejects a non-uuid projectId/observerId", () => {
    expect(observationFormSchema.safeParse({ ...VALID_INPUT, projectId: "not-a-uuid" }).success).toBe(false);
    expect(observationFormSchema.safeParse({ ...VALID_INPUT, observerId: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects blank work area/description", () => {
    expect(observationFormSchema.safeParse({ ...VALID_INPUT, workArea: "  " }).success).toBe(false);
    expect(observationFormSchema.safeParse({ ...VALID_INPUT, description: "" }).success).toBe(false);
  });

  it("rejects a malformed observedAt (not the datetime-local shape)", () => {
    expect(observationFormSchema.safeParse({ ...VALID_INPUT, observedAt: "2026-08-02" }).success).toBe(false);
    expect(observationFormSchema.safeParse({ ...VALID_INPUT, observedAt: "08/02/2026 14:30" }).success).toBe(false);
  });

  it("allows immediateActionTaken to be empty — optional per this milestone's requirement", () => {
    expect(observationFormSchema.safeParse({ ...VALID_INPUT, immediateActionTaken: "" }).success).toBe(true);
  });

  it("requires isStopWork to be an actual boolean", () => {
    expect(observationFormSchema.safeParse({ ...VALID_INPUT, isStopWork: "true" }).success).toBe(false);
  });
});

describe("observationParticipantsFormSchema", () => {
  it("accepts an empty array — people involved is optional (\"where appropriate\")", () => {
    expect(observationParticipantsFormSchema.safeParse([]).success).toBe(true);
  });

  it("accepts an array of uuids", () => {
    expect(observationParticipantsFormSchema.safeParse(["123e4567-e89b-42d3-a456-426614174000"]).success).toBe(true);
  });

  it("rejects a non-uuid entry", () => {
    expect(observationParticipantsFormSchema.safeParse(["not-a-uuid"]).success).toBe(false);
  });
});
