import { describe, it, expect } from "vitest";
import { formatToolboxMeetingDisplayTitle, formatToolboxMeetingNumberLabel } from "./types";

describe("formatToolboxMeetingNumberLabel", () => {
  it("formats the required 'TOOLBOX MEETING: #<n>' display format", () => {
    expect(formatToolboxMeetingNumberLabel(1)).toBe("TOOLBOX MEETING: #1");
    expect(formatToolboxMeetingNumberLabel(12)).toBe("TOOLBOX MEETING: #12");
  });
});

describe("formatToolboxMeetingDisplayTitle", () => {
  it("appends the descriptive title per the module's own example", () => {
    expect(formatToolboxMeetingDisplayTitle(12, "Line of Fire and Material Handling")).toBe("TOOLBOX MEETING: #12 — Line of Fire and Material Handling");
  });
});
