import { describe, it, expect } from "vitest";
import { buildDirectionsUrl } from "./directions";

describe("buildDirectionsUrl", () => {
  it("prefers coordinates when both are set", () => {
    const url = buildDirectionsUrl({ siteLatitude: 40.7128, siteLongitude: -74.006, siteAddress: "123 Main St" });
    expect(url).toBe("https://www.google.com/maps/dir/?api=1&destination=40.7128,-74.006");
  });

  it("falls back to the address when no coordinates are set", () => {
    const url = buildDirectionsUrl({ siteLatitude: null, siteLongitude: null, siteAddress: "123 Main St, Springfield" });
    expect(url).toBe("https://www.google.com/maps/dir/?api=1&destination=123%20Main%20St%2C%20Springfield");
  });

  it("returns null when nothing is set", () => {
    expect(buildDirectionsUrl({ siteLatitude: null, siteLongitude: null, siteAddress: null })).toBe(null);
    expect(buildDirectionsUrl({ siteLatitude: null, siteLongitude: null, siteAddress: "   " })).toBe(null);
  });
});
