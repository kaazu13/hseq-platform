import { describe, it, expect } from "vitest";
import { optionalText, optionalDate, DEFAULT_TEXT_MAX_LENGTH } from "./validation";

describe("optionalText", () => {
  it("treats an empty string as undefined (HTML forms always submit '' for a blank field)", () => {
    expect(optionalText.parse("")).toBeUndefined();
  });

  it("treats undefined as undefined", () => {
    expect(optionalText.parse(undefined)).toBeUndefined();
  });

  it("trims surrounding whitespace", () => {
    expect(optionalText.parse("  hello  ")).toBe("hello");
  });

  it("passes through a real value unchanged (after trim)", () => {
    expect(optionalText.parse("hello")).toBe("hello");
  });

  it("treats whitespace-only input as undefined (trims to '')", () => {
    expect(optionalText.parse("   ")).toBeUndefined();
  });

  it("rejects input longer than DEFAULT_TEXT_MAX_LENGTH (Phase 11 platform-wide input-limit backstop)", () => {
    expect(() => optionalText.parse("a".repeat(DEFAULT_TEXT_MAX_LENGTH + 1))).toThrow();
  });

  it("accepts input at exactly DEFAULT_TEXT_MAX_LENGTH", () => {
    expect(optionalText.parse("a".repeat(DEFAULT_TEXT_MAX_LENGTH))).toHaveLength(DEFAULT_TEXT_MAX_LENGTH);
  });
});

describe("optionalDate", () => {
  it("accepts a valid ISO date", () => {
    expect(optionalDate.parse("2026-07-26")).toBe("2026-07-26");
  });

  it("treats an empty string as undefined", () => {
    expect(optionalDate.parse("")).toBeUndefined();
  });

  it("treats undefined as undefined", () => {
    expect(optionalDate.parse(undefined)).toBeUndefined();
  });

  it("rejects a malformed date string", () => {
    expect(() => optionalDate.parse("07/26/2026")).toThrow();
  });

  it("rejects a non-date string", () => {
    expect(() => optionalDate.parse("not a date")).toThrow();
  });

  it("rejects an incomplete date", () => {
    expect(() => optionalDate.parse("2026-07")).toThrow();
  });
});
