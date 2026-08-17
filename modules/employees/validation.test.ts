import { describe, it, expect } from "vitest";
import { updateMyBirthDateFormSchema } from "./validation";

describe("updateMyBirthDateFormSchema (Task 3 Part 7)", () => {
  it("accepts no birth date", () => {
    const result = updateMyBirthDateFormSchema.safeParse({ birthDate: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.birthDate).toBeUndefined();
  });

  it("accepts a realistic birth date", () => {
    expect(updateMyBirthDateFormSchema.safeParse({ birthDate: "1990-05-15" }).success).toBe(true);
  });

  it("rejects someone too young (under 14)", () => {
    const tooYoung = new Date();
    tooYoung.setUTCFullYear(tooYoung.getUTCFullYear() - 5);
    expect(updateMyBirthDateFormSchema.safeParse({ birthDate: tooYoung.toISOString().slice(0, 10) }).success).toBe(false);
  });

  it("rejects an unrealistically old date (over 100)", () => {
    expect(updateMyBirthDateFormSchema.safeParse({ birthDate: "1850-01-01" }).success).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(updateMyBirthDateFormSchema.safeParse({ birthDate: "not-a-date" }).success).toBe(false);
  });
});
