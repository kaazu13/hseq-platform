import { describe, it, expect } from "vitest";
import { validateCompanyLogoFile, buildCompanyLogoObjectPath, MAX_LOGO_SIZE_BYTES } from "./company-logos";

// A minimal valid 1x1 PNG (base64), used to test the decoded-image path.
const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function makePngFile(): File {
  const bytes = Buffer.from(ONE_PIXEL_PNG_BASE64, "base64");
  return new File([bytes], "logo.png", { type: "image/png" });
}

describe("validateCompanyLogoFile", () => {
  it("accepts a genuine, small PNG", async () => {
    const result = await validateCompanyLogoFile(makePngFile());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
    }
  });

  it("rejects an empty file", async () => {
    const file = new File([], "empty.png", { type: "image/png" });
    const result = await validateCompanyLogoFile(file);
    expect(result.ok).toBe(false);
  });

  it("rejects a disallowed MIME type outright", async () => {
    const bytes = Buffer.from(ONE_PIXEL_PNG_BASE64, "base64");
    const file = new File([bytes], "logo.svg", { type: "image/svg+xml" });
    const result = await validateCompanyLogoFile(file);
    expect(result.ok).toBe(false);
  });

  it("rejects a renamed non-image file even with a spoofed PNG MIME type — decoded bytes, not extension/MIME alone", async () => {
    const file = new File([new TextEncoder().encode("not actually an image, just text")], "fake.png", { type: "image/png" });
    const result = await validateCompanyLogoFile(file);
    expect(result.ok).toBe(false);
  });

  it("rejects a file over the size ceiling", async () => {
    const oversized = new Uint8Array(MAX_LOGO_SIZE_BYTES + 1);
    const file = new File([oversized], "big.png", { type: "image/png" });
    const result = await validateCompanyLogoFile(file);
    expect(result.ok).toBe(false);
  });
});

describe("buildCompanyLogoObjectPath", () => {
  it("scopes the path to the company id, with an extension matching the MIME type", () => {
    const path = buildCompanyLogoObjectPath("11111111-1111-1111-1111-111111111111", "image/webp");
    expect(path.startsWith("11111111-1111-1111-1111-111111111111/")).toBe(true);
    expect(path.endsWith(".webp")).toBe(true);
  });

  it("never includes any caller-supplied filename segment", () => {
    const path = buildCompanyLogoObjectPath("company-id", "image/png");
    expect(path).toMatch(/^company-id\/[0-9a-f-]+\.png$/);
  });
});
