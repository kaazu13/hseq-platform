import { describe, it, expect } from "vitest";
import { isPositiveObservationCategory, isPositiveObservation } from "./types";

describe("isPositiveObservationCategory", () => {
  it("is true only for the dedicated positive_observation category", () => {
    expect(isPositiveObservationCategory("positive_observation")).toBe(true);
    expect(isPositiveObservationCategory("unsafe_act")).toBe(false);
    expect(isPositiveObservationCategory("other")).toBe(false);
  });
});

describe("isPositiveObservation", () => {
  it("is true when the category is positive_observation, regardless of observation_type", () => {
    expect(isPositiveObservation({ category: "positive_observation", observation_type: "negative" })).toBe(true);
  });

  it("is true when observation_type is positive, regardless of category", () => {
    expect(isPositiveObservation({ category: "housekeeping", observation_type: "positive" })).toBe(true);
  });

  it("is false when neither condition holds", () => {
    expect(isPositiveObservation({ category: "unsafe_act", observation_type: "negative" })).toBe(false);
    expect(isPositiveObservation({ category: "ppe", observation_type: "general" })).toBe(false);
  });
});
