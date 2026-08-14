import { describe, it, expect } from "vitest";
import { invitationDisplayStatus, invitationStatusTone, INVITATION_STATUS_LABELS } from "./types";

describe("invitationDisplayStatus", () => {
  it("returns 'expired' for a pending invitation past its expiry, even though the stored status column is still 'pending'", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(invitationDisplayStatus({ status: "pending", expires_at: past })).toBe("expired");
  });

  it("returns 'pending' for a not-yet-expired pending invitation", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(invitationDisplayStatus({ status: "pending", expires_at: future })).toBe("pending");
  });

  it("passes through accepted/revoked unchanged regardless of expires_at", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(invitationDisplayStatus({ status: "accepted", expires_at: past })).toBe("accepted");
    expect(invitationDisplayStatus({ status: "revoked", expires_at: past })).toBe("revoked");
  });
});

describe("invitationStatusTone", () => {
  it("maps Pending/Expired=orange(attention), Accepted=green(positive), Revoked=gray(neutral) per item 13's spec", () => {
    expect(invitationStatusTone("pending")).toBe("attention");
    expect(invitationStatusTone("expired")).toBe("attention");
    expect(invitationStatusTone("accepted")).toBe("positive");
    expect(invitationStatusTone("revoked")).toBe("neutral");
  });

  it("every display status has a human label — never a raw enum string", () => {
    for (const status of ["pending", "accepted", "expired", "revoked"] as const) {
      expect(INVITATION_STATUS_LABELS[status]).toBeTruthy();
      expect(invitationStatusTone(status)).toBeTruthy();
    }
  });
});
