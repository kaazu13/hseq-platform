import { describe, it, expect } from "vitest";
import { toolboxTemplateMetadataSchema, replaceFileReasonSchema } from "./validation";

const VALID_INPUT = {
  title: "Working at Height Toolbox Talk",
  category: "working_at_height",
  language: "English",
  description: "",
};

describe("toolboxTemplateMetadataSchema", () => {
  it("accepts a fully populated valid input", () => {
    expect(toolboxTemplateMetadataSchema.safeParse(VALID_INPUT).success).toBe(true);
  });

  it("rejects a blank title", () => {
    expect(toolboxTemplateMetadataSchema.safeParse({ ...VALID_INPUT, title: "" }).success).toBe(false);
  });

  it("rejects a category outside the fixed 18-value list", () => {
    expect(toolboxTemplateMetadataSchema.safeParse({ ...VALID_INPUT, category: "not_a_category" }).success).toBe(false);
  });

  it("rejects a blank language — not DB-enforced as an enum, but still required", () => {
    expect(toolboxTemplateMetadataSchema.safeParse({ ...VALID_INPUT, language: "" }).success).toBe(false);
  });

  it("accepts a language outside the curated suggestion list — free text, not an enum", () => {
    expect(toolboxTemplateMetadataSchema.safeParse({ ...VALID_INPUT, language: "Swahili" }).success).toBe(true);
  });
});

describe("replaceFileReasonSchema", () => {
  it("rejects a blank reason", () => {
    expect(replaceFileReasonSchema.safeParse({ reason: "" }).success).toBe(false);
  });
});
