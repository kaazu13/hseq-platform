import { describe, it, expect } from "vitest";
import { createReportShareFormSchema, revokeReportShareFormSchema } from "./validation";

const VALID_UUID = "123e4567-e89b-42d3-a456-426614174000";

describe("createReportShareFormSchema", () => {
  it("accepts a valid recordType/recordId with no expiry", () => {
    const result = createReportShareFormSchema.safeParse({ recordType: "lmra", recordId: VALID_UUID, expiresAt: null });
    expect(result.success).toBe(true);
  });

  it("accepts a valid future expiresAt", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = createReportShareFormSchema.safeParse({ recordType: "scaffold_inspection", recordId: VALID_UUID, expiresAt: future });
    expect(result.success).toBe(true);
  });

  it("rejects an expiresAt in the past", () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const result = createReportShareFormSchema.safeParse({ recordType: "lmra", recordId: VALID_UUID, expiresAt: past });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown recordType", () => {
    const result = createReportShareFormSchema.safeParse({ recordType: "not_a_real_type", recordId: VALID_UUID, expiresAt: null });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid recordId", () => {
    const result = createReportShareFormSchema.safeParse({ recordType: "lmra", recordId: "not-a-uuid", expiresAt: null });
    expect(result.success).toBe(false);
  });
});

describe("revokeReportShareFormSchema", () => {
  it("accepts a valid uuid shareId", () => {
    expect(revokeReportShareFormSchema.safeParse({ shareId: VALID_UUID }).success).toBe(true);
  });

  it("rejects a non-uuid shareId", () => {
    expect(revokeReportShareFormSchema.safeParse({ shareId: "nope" }).success).toBe(false);
  });
});
