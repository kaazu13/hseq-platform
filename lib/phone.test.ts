import { describe, it, expect } from "vitest";
import type { CountryCode } from "libphonenumber-js/min";
import { isValidE164, toE164, formatE164ForDisplay, countryDisplayName, callingCodeFor, flagEmoji, PHONE_COUNTRIES } from "./phone";

describe("isValidE164", () => {
  it("accepts a well-formed E.164 string", () => {
    expect(isValidE164("+15550100000")).toBe(true);
  });

  it("rejects spaces, punctuation, and a missing leading +", () => {
    expect(isValidE164("+1 555 0100")).toBe(false);
    expect(isValidE164("(555) 010-0000")).toBe(false);
    expect(isValidE164("15550100000")).toBe(false);
  });

  it("rejects a leading zero in the country code position", () => {
    expect(isValidE164("+0123456789")).toBe(false);
  });
});

describe("toE164", () => {
  it("converts a valid national number for a given country", () => {
    const result = toE164("020 7946 0958", "GB");
    expect(result).toMatch(/^\+44\d+$/);
  });

  it("returns null for an incomplete/invalid number", () => {
    expect(toE164("123", "US")).toBe(null);
  });
});

describe("formatE164ForDisplay", () => {
  it("formats a valid E.164 number for display", () => {
    const formatted = formatE164ForDisplay("+442079460958");
    expect(formatted).toContain("+44");
  });

  it("falls back to the raw value when it can't be parsed", () => {
    expect(formatE164ForDisplay("not-a-number")).toBe("not-a-number");
  });
});

describe("country metadata", () => {
  it("PHONE_COUNTRIES is non-empty and includes common countries", () => {
    expect(PHONE_COUNTRIES.length).toBeGreaterThan(100);
    expect(PHONE_COUNTRIES).toContain("US");
    expect(PHONE_COUNTRIES).toContain("GB");
  });

  it("callingCodeFor returns a + prefixed code", () => {
    expect(callingCodeFor("US")).toBe("+1");
    expect(callingCodeFor("GB")).toBe("+44");
  });

  it("countryDisplayName returns a human-readable name", () => {
    expect(countryDisplayName("US")).toBe("United States");
  });
});

describe("flagEmoji", () => {
  it("maps a country code to its regional-indicator flag emoji", () => {
    expect(flagEmoji("US")).toBe("🇺🇸");
    expect(flagEmoji("GB")).toBe("🇬🇧");
    expect(flagEmoji("SE")).toBe("🇸🇪");
  });

  it("is case-insensitive", () => {
    expect(flagEmoji("us" as CountryCode)).toBe(flagEmoji("US"));
  });

  it("produces a distinct flag for every supported phone country", () => {
    const flags = new Set(PHONE_COUNTRIES.map(flagEmoji));
    expect(flags.size).toBe(PHONE_COUNTRIES.length);
  });
});
