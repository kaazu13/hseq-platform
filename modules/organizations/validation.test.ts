import { describe, it, expect } from "vitest";
import { updateOwnProfileFormSchema } from "./validation";

describe("updateOwnProfileFormSchema", () => {
  it("accepts a valid full name with no phone", () => {
    const result = updateOwnProfileFormSchema.safeParse({ fullName: "Cristi Owner", phone: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBeUndefined();
  });

  it("accepts a full name with a phone number", () => {
    expect(updateOwnProfileFormSchema.safeParse({ fullName: "Cristi Owner", phone: "+1 555 0100" }).success).toBe(true);
  });

  it("rejects a blank or whitespace-only full name", () => {
    expect(updateOwnProfileFormSchema.safeParse({ fullName: "", phone: "" }).success).toBe(false);
    expect(updateOwnProfileFormSchema.safeParse({ fullName: "   ", phone: "" }).success).toBe(false);
  });

  it("has no field for role, organization, or status — those stay read-only by construction, not just by convention", () => {
    const shape = updateOwnProfileFormSchema.shape;
    expect(Object.keys(shape)).toEqual(["fullName", "phone"]);
  });
});
