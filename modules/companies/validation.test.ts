import { describe, it, expect } from "vitest";
import { updateOwnProfileFormSchema } from "./validation";

describe("updateOwnProfileFormSchema", () => {
  it("accepts no phone", () => {
    const result = updateOwnProfileFormSchema.safeParse({ phone: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBeUndefined();
  });

  it("accepts a valid E.164 phone number — Task 3 Part 6's PhoneInput always produces this shape", () => {
    expect(updateOwnProfileFormSchema.safeParse({ phone: "+15550100000" }).success).toBe(true);
  });

  it("rejects a non-E.164 phone number (spaces/punctuation) — the DB constraint (profiles_phone_e164) requires strict E.164", () => {
    expect(updateOwnProfileFormSchema.safeParse({ phone: "+1 555 0100" }).success).toBe(false);
    expect(updateOwnProfileFormSchema.safeParse({ phone: "(555) 010-0000" }).success).toBe(false);
  });

  it("item 10: has no fullName field at all — a user's display name is no longer self-editable, not even to the same value", () => {
    const shape = updateOwnProfileFormSchema.shape;
    expect(Object.keys(shape)).toEqual(["phone"]);
    expect("fullName" in shape).toBe(false);
  });

  it("has no field for role, company, or status — those stay read-only by construction, not just by convention", () => {
    const shape = updateOwnProfileFormSchema.shape;
    expect(Object.keys(shape)).toEqual(["phone"]);
  });
});
