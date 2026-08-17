import { describe, it, expect } from "vitest";
import { projectLocationSettingsSchema, projectSiteLocationSchema } from "./validation";

describe("projectLocationSettingsSchema (Task 3 Part 12)", () => {
  it("accepts both fields empty", () => {
    const result = projectLocationSettingsSchema.safeParse({ countryCode: "", timezone: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.countryCode).toBeUndefined();
      expect(result.data.timezone).toBeUndefined();
    }
  });

  it("accepts a valid country code and a real IANA timezone", () => {
    expect(projectLocationSettingsSchema.safeParse({ countryCode: "US", timezone: "America/New_York" }).success).toBe(true);
  });

  it("rejects a malformed country code", () => {
    expect(projectLocationSettingsSchema.safeParse({ countryCode: "usa", timezone: "" }).success).toBe(false);
    expect(projectLocationSettingsSchema.safeParse({ countryCode: "U", timezone: "" }).success).toBe(false);
  });

  it("rejects a timezone that isn't a real IANA name", () => {
    expect(projectLocationSettingsSchema.safeParse({ countryCode: "", timezone: "Not/A_Timezone" }).success).toBe(false);
  });
});

describe("projectSiteLocationSchema (Task 3 Part 13)", () => {
  it("accepts everything blank", () => {
    expect(projectSiteLocationSchema.safeParse({ siteAddress: "" }).success).toBe(true);
  });

  it("accepts a valid address + coordinate pair", () => {
    const result = projectSiteLocationSchema.safeParse({ siteAddress: "123 Main St", siteLatitude: 40.7128, siteLongitude: -74.006 });
    expect(result.success).toBe(true);
  });

  it("rejects latitude without longitude, and vice versa — a lone coordinate is meaningless", () => {
    expect(projectSiteLocationSchema.safeParse({ siteAddress: "", siteLatitude: 40.7128 }).success).toBe(false);
    expect(projectSiteLocationSchema.safeParse({ siteAddress: "", siteLongitude: -74.006 }).success).toBe(false);
  });

  it("rejects out-of-range coordinates", () => {
    expect(projectSiteLocationSchema.safeParse({ siteAddress: "", siteLatitude: 91, siteLongitude: 0 }).success).toBe(false);
    expect(projectSiteLocationSchema.safeParse({ siteAddress: "", siteLatitude: 0, siteLongitude: 181 }).success).toBe(false);
  });
});
