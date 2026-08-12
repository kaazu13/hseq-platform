import { describe, it, expect } from "vitest";
import { suspendAccountSchema, banAccountSchema, issuePlatformWarningSchema } from "./validation";

describe("suspendAccountSchema", () => {
  it("requires a non-blank reason", () => {
    expect(suspendAccountSchema.safeParse({ reason: "Repeated policy violations" }).success).toBe(true);
    expect(suspendAccountSchema.safeParse({ reason: "" }).success).toBe(false);
    expect(suspendAccountSchema.safeParse({ reason: "   " }).success).toBe(false);
  });
});

describe("banAccountSchema", () => {
  it("requires a non-blank reason", () => {
    expect(banAccountSchema.safeParse({ reason: "Confirmed fraudulent activity" }).success).toBe(true);
    expect(banAccountSchema.safeParse({ reason: "" }).success).toBe(false);
  });
});

describe("issuePlatformWarningSchema", () => {
  it("requires a non-blank reason", () => {
    expect(issuePlatformWarningSchema.safeParse({ reason: "Inappropriate use of shared documents" }).success).toBe(true);
    expect(issuePlatformWarningSchema.safeParse({ reason: "" }).success).toBe(false);
  });
});
