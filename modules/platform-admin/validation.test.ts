import { describe, it, expect } from "vitest";
import { suspendAccountSchema, banAccountSchema, issuePlatformWarningSchema, adminUpdateUserNameSchema } from "./validation";

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

describe("adminUpdateUserNameSchema — item 10: the Platform Super Admin's dedicated rename path", () => {
  it("requires a non-blank name", () => {
    expect(adminUpdateUserNameSchema.safeParse({ fullName: "Corrected Name" }).success).toBe(true);
    expect(adminUpdateUserNameSchema.safeParse({ fullName: "" }).success).toBe(false);
    expect(adminUpdateUserNameSchema.safeParse({ fullName: "   " }).success).toBe(false);
  });

  it("rejects an oversized name", () => {
    expect(adminUpdateUserNameSchema.safeParse({ fullName: "x".repeat(201) }).success).toBe(false);
  });
});
