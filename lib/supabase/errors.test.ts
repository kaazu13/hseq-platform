import { describe, it, expect } from "vitest";
import { flattenFieldErrors, isUniqueViolation, isRlsViolation, isRaisedException } from "./errors";

describe("flattenFieldErrors", () => {
  it("takes the first message per field", () => {
    const zodLikeError = {
      flatten: () => ({
        fieldErrors: {
          name: ["Name is required", "Name is too short"],
          email: ["Invalid email"],
        },
      }),
    };
    expect(flattenFieldErrors(zodLikeError)).toEqual({
      name: "Name is required",
      email: "Invalid email",
    });
  });

  it("skips fields with no messages", () => {
    const zodLikeError = {
      flatten: () => ({
        fieldErrors: {
          name: undefined,
          email: [],
        },
      }),
    };
    expect(flattenFieldErrors(zodLikeError)).toEqual({});
  });

  it("returns an empty object for no field errors", () => {
    expect(flattenFieldErrors({ flatten: () => ({ fieldErrors: {} }) })).toEqual({});
  });
});

describe("isUniqueViolation", () => {
  it("recognizes Postgres 23505", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("rejects other codes", () => {
    expect(isUniqueViolation({ code: "42501" })).toBe(false);
    expect(isUniqueViolation({})).toBe(false);
  });
});

describe("isRlsViolation", () => {
  it("recognizes Postgres 42501", () => {
    expect(isRlsViolation({ code: "42501" })).toBe(true);
  });

  it("rejects other codes", () => {
    expect(isRlsViolation({ code: "23505" })).toBe(false);
    expect(isRlsViolation({})).toBe(false);
  });
});

describe("isRaisedException", () => {
  it("recognizes Postgres P0001", () => {
    expect(isRaisedException({ code: "P0001" })).toBe(true);
  });

  it("rejects other codes", () => {
    expect(isRaisedException({ code: "23505" })).toBe(false);
    expect(isRaisedException({})).toBe(false);
  });
});
