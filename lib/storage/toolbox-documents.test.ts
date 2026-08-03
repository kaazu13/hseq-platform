import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { validatePdfFile, computeSha256Checksum, buildToolboxMeetingObjectPath, buildToolboxTemplateObjectPath, buildSafetyFlashObjectPath, MAX_PDF_SIZE_BYTES } from "./toolbox-documents";

const PDF_MAGIC = new TextEncoder().encode("%PDF-1.4\n%mock pdf content");

function makePdfFile(name = "meeting.pdf", bytes: Uint8Array = PDF_MAGIC, type = "application/pdf") {
  return new File([bytes], name, { type });
}

describe("validatePdfFile", () => {
  it("accepts a genuine, correctly-sized PDF", async () => {
    const result = await validatePdfFile(makePdfFile());
    expect(result.ok).toBe(true);
  });

  it("rejects an empty file", async () => {
    const result = await validatePdfFile(makePdfFile("empty.pdf", new Uint8Array(0)));
    expect(result.ok).toBe(false);
  });

  it("rejects a file over the size ceiling", async () => {
    const oversized = new Uint8Array(MAX_PDF_SIZE_BYTES + 1);
    oversized.set(PDF_MAGIC);
    const result = await validatePdfFile(makePdfFile("big.pdf", oversized));
    expect(result.ok).toBe(false);
  });

  it("rejects a non-PDF MIME type even with a .pdf extension", async () => {
    const result = await validatePdfFile(makePdfFile("meeting.pdf", PDF_MAGIC, "image/png"));
    expect(result.ok).toBe(false);
  });

  it("rejects a file without a .pdf extension", async () => {
    const result = await validatePdfFile(makePdfFile("meeting.docx", PDF_MAGIC, "application/pdf"));
    expect(result.ok).toBe(false);
  });

  it("rejects a file with a spoofed MIME/extension but non-PDF magic bytes — defense against a renamed non-PDF", async () => {
    const fakeBytes = new TextEncoder().encode("Not actually a PDF at all");
    const result = await validatePdfFile(makePdfFile("fake.pdf", fakeBytes, "application/pdf"));
    expect(result.ok).toBe(false);
  });
});

describe("computeSha256Checksum", () => {
  it("matches a manually-computed sha256 hex digest of the same bytes", async () => {
    const file = makePdfFile();
    const checksum = await computeSha256Checksum(file);
    const expected = createHash("sha256").update(Buffer.from(PDF_MAGIC)).digest("hex");
    expect(checksum).toBe(expected);
  });

  it("produces different checksums for different content", async () => {
    const a = await computeSha256Checksum(makePdfFile("a.pdf", PDF_MAGIC));
    const b = await computeSha256Checksum(makePdfFile("b.pdf", new TextEncoder().encode("%PDF-1.4\ndifferent content")));
    expect(a).not.toBe(b);
  });
});

describe("storage path builders", () => {
  it("buildToolboxMeetingObjectPath nests organization/meetings/project/record with a fresh uuid filename", () => {
    const path = buildToolboxMeetingObjectPath("org-1", "project-1", "meeting-1", "Meeting Notes.pdf");
    expect(path).toMatch(/^org-1\/meetings\/project-1\/meeting-1\/[0-9a-f-]{36}-Meeting_Notes\.pdf$/);
  });

  it("buildToolboxTemplateObjectPath has no project segment — organization-wide", () => {
    const path = buildToolboxTemplateObjectPath("org-1", "template-1", "Template.pdf");
    expect(path).toMatch(/^org-1\/templates\/template-1\/[0-9a-f-]{36}-Template\.pdf$/);
  });

  it("buildSafetyFlashObjectPath uses the project id when one is set", () => {
    const path = buildSafetyFlashObjectPath("org-1", "project-1", "flash-1", "Flash.pdf");
    expect(path).toMatch(/^org-1\/safety-flash\/project-1\/flash-1\/[0-9a-f-]{36}-Flash\.pdf$/);
  });

  it("buildSafetyFlashObjectPath uses the literal 'org' segment when there is no project", () => {
    const path = buildSafetyFlashObjectPath("org-1", null, "flash-1", "Flash.pdf");
    expect(path).toMatch(/^org-1\/safety-flash\/org\/flash-1\/[0-9a-f-]{36}-Flash\.pdf$/);
  });

  it("two builds of the same inputs never collide — each upload gets a fresh uuid", () => {
    const first = buildToolboxMeetingObjectPath("org-1", "project-1", "meeting-1", "same.pdf");
    const second = buildToolboxMeetingObjectPath("org-1", "project-1", "meeting-1", "same.pdf");
    expect(first).not.toBe(second);
  });
});
