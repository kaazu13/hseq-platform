import { describe, it, expect } from "vitest";
import { changeMyPasswordSchema } from "./validation";

const valid = { currentPassword: "oldPassword1", newPassword: "newPassword2", confirmPassword: "newPassword2" };

describe("changeMyPasswordSchema", () => {
  it("accepts a valid change", () => {
    expect(changeMyPasswordSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty current password", () => {
    expect(changeMyPasswordSchema.safeParse({ ...valid, currentPassword: "" }).success).toBe(false);
  });

  it("rejects a new password under 8 characters", () => {
    expect(changeMyPasswordSchema.safeParse({ ...valid, newPassword: "short1", confirmPassword: "short1" }).success).toBe(false);
  });

  it("rejects a new/confirm mismatch, flagged on confirmPassword", () => {
    const result = changeMyPasswordSchema.safeParse({ ...valid, confirmPassword: "somethingElse1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.confirmPassword?.[0]).toBeTruthy();
    }
  });

  it("rejects a new password identical to the current one, flagged on newPassword", () => {
    const result = changeMyPasswordSchema.safeParse({ currentPassword: "samePassword1", newPassword: "samePassword1", confirmPassword: "samePassword1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.newPassword?.[0]).toBeTruthy();
    }
  });
});
