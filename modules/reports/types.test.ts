import { describe, it, expect } from "vitest";
import { getReportShareStatus, resolveShareExpiryPreset, isDocumentPassthroughRecordType } from "./types";

describe("getReportShareStatus", () => {
  const now = new Date("2026-08-10T12:00:00Z");

  it("is revoked when revoked_at is set, regardless of expiry", () => {
    expect(getReportShareStatus({ revoked_at: "2026-08-01T00:00:00Z", expires_at: null }, now)).toBe("revoked");
    expect(getReportShareStatus({ revoked_at: "2026-08-01T00:00:00Z", expires_at: "2030-01-01T00:00:00Z" }, now)).toBe("revoked");
  });

  it("is expired when expires_at is in the past and not revoked", () => {
    expect(getReportShareStatus({ revoked_at: null, expires_at: "2026-08-10T11:59:59Z" }, now)).toBe("expired");
  });

  it("is active when not revoked and either no expiry or a future expiry", () => {
    expect(getReportShareStatus({ revoked_at: null, expires_at: null }, now)).toBe("active");
    expect(getReportShareStatus({ revoked_at: null, expires_at: "2026-08-10T12:00:01Z" }, now)).toBe("active");
  });

  it("treats an expires_at exactly equal to now as expired, not active (inclusive boundary)", () => {
    expect(getReportShareStatus({ revoked_at: null, expires_at: "2026-08-10T12:00:00Z" }, now)).toBe("expired");
  });
});

describe("resolveShareExpiryPreset", () => {
  const from = new Date("2026-08-10T12:00:00Z");

  it("resolves each preset to the correct absolute offset", () => {
    expect(resolveShareExpiryPreset("24h", from)).toBe("2026-08-11T12:00:00.000Z");
    expect(resolveShareExpiryPreset("7d", from)).toBe("2026-08-17T12:00:00.000Z");
    expect(resolveShareExpiryPreset("30d", from)).toBe("2026-09-09T12:00:00.000Z");
  });

  it("resolves 'none' to null", () => {
    expect(resolveShareExpiryPreset("none", from)).toBeNull();
  });
});

describe("isDocumentPassthroughRecordType", () => {
  it("is true only for toolbox_meeting and safety_flash", () => {
    expect(isDocumentPassthroughRecordType("toolbox_meeting")).toBe(true);
    expect(isDocumentPassthroughRecordType("safety_flash")).toBe(true);
    expect(isDocumentPassthroughRecordType("lmra")).toBe(false);
    expect(isDocumentPassthroughRecordType("scaffold_inspection")).toBe(false);
    expect(isDocumentPassthroughRecordType("safety_observation")).toBe(false);
    expect(isDocumentPassthroughRecordType("corrective_action")).toBe(false);
  });
});
