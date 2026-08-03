import { describe, it, expect } from "vitest";
import { formatSafetyFlashDisplayTitle, formatSafetyFlashNumberLabel } from "./types";

describe("formatSafetyFlashNumberLabel", () => {
  it("formats the required 'SAFETY FLASH: #<n>' display format", () => {
    expect(formatSafetyFlashNumberLabel(1)).toBe("SAFETY FLASH: #1");
    expect(formatSafetyFlashNumberLabel(4)).toBe("SAFETY FLASH: #4");
  });
});

describe("formatSafetyFlashDisplayTitle", () => {
  it("appends the descriptive title per the module's own example", () => {
    expect(formatSafetyFlashDisplayTitle(4, "Dropped Object Prevention")).toBe("SAFETY FLASH: #4 — Dropped Object Prevention");
  });
});
