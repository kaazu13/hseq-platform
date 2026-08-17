import { describe, it, expect } from "vitest";
import { updateGreetingSettingSchema } from "./validation";

describe("updateGreetingSettingSchema (Task 3 Part 8)", () => {
  it("accepts a message using only allowlisted placeholders", () => {
    const result = updateGreetingSettingSchema.safeParse({ enabled: true, messageTemplate: "Happy Birthday, {{first_name}} {{last_name}}, from {{company_name}}!" });
    expect(result.success).toBe(true);
  });

  it("accepts a message with no placeholders at all", () => {
    expect(updateGreetingSettingSchema.safeParse({ enabled: false, messageTemplate: "Happy holidays!" }).success).toBe(true);
  });

  it("rejects a message with an unknown placeholder", () => {
    const result = updateGreetingSettingSchema.safeParse({ enabled: true, messageTemplate: "Hi {{age}}!" });
    expect(result.success).toBe(false);
  });

  it("rejects any other {{word}}-shaped placeholder not on the allowlist, even one that looks plausible", () => {
    const result = updateGreetingSettingSchema.safeParse({ enabled: true, messageTemplate: "Hi {{__proto__}}!" });
    expect(result.success).toBe(false);
  });

  it("treats a non-word-shaped {{...}} as harmless literal text (there is no template engine, only fixed-token replace, so it simply isn't a recognized placeholder pattern at all)", () => {
    const result = updateGreetingSettingSchema.safeParse({ enabled: true, messageTemplate: "Season's greetings {{ }}!" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty message", () => {
    expect(updateGreetingSettingSchema.safeParse({ enabled: true, messageTemplate: "" }).success).toBe(false);
  });
});
