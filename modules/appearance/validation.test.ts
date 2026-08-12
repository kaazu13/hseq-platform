import { describe, it, expect } from "vitest";
import { updateAppearanceSchema } from "./validation";

describe("updateAppearanceSchema", () => {
  it("accepts a valid theme mode alone", () => {
    expect(updateAppearanceSchema.safeParse({ themeMode: "dark" }).success).toBe(true);
  });

  it("accepts a valid accent theme alone", () => {
    expect(updateAppearanceSchema.safeParse({ accentTheme: "safety_green" }).success).toBe(true);
  });

  it("rejects a theme mode outside light/dark/system", () => {
    expect(updateAppearanceSchema.safeParse({ themeMode: "midnight" }).success).toBe(false);
  });

  it("rejects an accent theme outside the fixed 5 — never arbitrary input", () => {
    expect(updateAppearanceSchema.safeParse({ accentTheme: "#ff0000" }).success).toBe(false);
    expect(updateAppearanceSchema.safeParse({ accentTheme: "custom" }).success).toBe(false);
  });

  it("accepts an empty object — both fields are optional (partial updates)", () => {
    expect(updateAppearanceSchema.safeParse({}).success).toBe(true);
  });
});
