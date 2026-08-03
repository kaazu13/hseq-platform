import { describe, it, expect } from "vitest";
import { safetyFlashMetadataSchema, replaceFileReasonSchema } from "./validation";

const VALID_INPUT = {
  projectId: "",
  title: "Dropped Object Prevention",
  dateIssued: "2026-08-01",
  category: "falling_objects",
  language: "English",
  issuedByEmployeeId: "123e4567-e89b-42d3-a456-426614174000",
  summary: "",
};

describe("safetyFlashMetadataSchema", () => {
  it("accepts a fully populated valid input with no project (organization-wide)", () => {
    const result = safetyFlashMetadataSchema.safeParse(VALID_INPUT);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.projectId).toBeUndefined();
  });

  it("accepts a valid input WITH a project", () => {
    const result = safetyFlashMetadataSchema.safeParse({ ...VALID_INPUT, projectId: "123e4567-e89b-42d3-a456-426614174001" });
    expect(result.success).toBe(true);
  });

  it("rejects a blank title", () => {
    expect(safetyFlashMetadataSchema.safeParse({ ...VALID_INPUT, title: "" }).success).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(safetyFlashMetadataSchema.safeParse({ ...VALID_INPUT, dateIssued: "not-a-date" }).success).toBe(false);
  });

  it("rejects a category outside the fixed list", () => {
    expect(safetyFlashMetadataSchema.safeParse({ ...VALID_INPUT, category: "invalid" }).success).toBe(false);
  });

  it("rejects a non-uuid issuedByEmployeeId", () => {
    expect(safetyFlashMetadataSchema.safeParse({ ...VALID_INPUT, issuedByEmployeeId: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects a non-uuid projectId when one is provided", () => {
    expect(safetyFlashMetadataSchema.safeParse({ ...VALID_INPUT, projectId: "not-a-uuid" }).success).toBe(false);
  });
});

describe("replaceFileReasonSchema", () => {
  it("rejects a blank reason", () => {
    expect(replaceFileReasonSchema.safeParse({ reason: "" }).success).toBe(false);
  });
});
