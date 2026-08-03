import { describe, it, expect } from "vitest";
import { toolboxMeetingMetadataSchema, replaceFileReasonSchema } from "./validation";

const VALID_INPUT = {
  projectId: "123e4567-e89b-42d3-a456-426614174000",
  title: "Line of Fire and Material Handling",
  meetingDate: "2026-08-01",
  workArea: "",
  heldByEmployeeId: "123e4567-e89b-42d3-a456-426614174001",
  notes: "",
};

describe("toolboxMeetingMetadataSchema", () => {
  it("accepts a fully populated valid input", () => {
    expect(toolboxMeetingMetadataSchema.safeParse(VALID_INPUT).success).toBe(true);
  });

  it("rejects a blank title", () => {
    expect(toolboxMeetingMetadataSchema.safeParse({ ...VALID_INPUT, title: "  " }).success).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(toolboxMeetingMetadataSchema.safeParse({ ...VALID_INPUT, meetingDate: "08/01/2026" }).success).toBe(false);
  });

  it("rejects a non-uuid heldByEmployeeId", () => {
    expect(toolboxMeetingMetadataSchema.safeParse({ ...VALID_INPUT, heldByEmployeeId: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects a non-uuid projectId", () => {
    expect(toolboxMeetingMetadataSchema.safeParse({ ...VALID_INPUT, projectId: "not-a-uuid" }).success).toBe(false);
  });

  it("allows workArea/notes to be omitted", () => {
    const result = toolboxMeetingMetadataSchema.safeParse(VALID_INPUT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.workArea).toBeUndefined();
      expect(result.data.notes).toBeUndefined();
    }
  });
});

describe("replaceFileReasonSchema", () => {
  it("accepts a populated reason", () => {
    expect(replaceFileReasonSchema.safeParse({ reason: "Wrong PDF uploaded initially" }).success).toBe(true);
  });

  it("rejects a blank or whitespace-only reason — a controlled replacement always needs a fresh reason", () => {
    expect(replaceFileReasonSchema.safeParse({ reason: "" }).success).toBe(false);
    expect(replaceFileReasonSchema.safeParse({ reason: "   " }).success).toBe(false);
  });
});
