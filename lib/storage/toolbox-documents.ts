import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared upload/validation/signed-URL helpers for the `toolbox-documents`
 * Storage bucket (see supabase/migrations/20260803161000_toolbox_documents_storage.sql
 * for the bucket/RLS design) — reused by modules/toolbox-meetings,
 * modules/toolbox-templates, and modules/safety-flash's actions.ts files
 * so the PDF-only validation and path convention are defined exactly once.
 */

export const TOOLBOX_DOCUMENTS_BUCKET = "toolbox-documents";

/**
 * 25 MB — a documented platform default ceiling for a scanned meeting/
 * template/flash PDF, matching the same limit enforced at the bucket
 * level (`storage.buckets.file_size_limit`) and in each table's
 * `file_size_bytes` CHECK constraint. Not a claim that this is the right
 * limit for every deployment — raise it in one place (all three) if real
 * usage needs more.
 */
export const MAX_PDF_SIZE_BYTES = 25 * 1024 * 1024;

const PDF_MAGIC_BYTES = "%PDF-";

export type PdfValidationResult = { ok: true } | { ok: false; message: string };

/**
 * Validates a File is a genuine, acceptably-sized PDF before it's ever
 * uploaded — MIME type, extension, size, AND the file's actual magic
 * bytes (`%PDF-`), so a renamed non-PDF with a spoofed MIME type is still
 * rejected. This is defense-in-depth on top of the bucket's own
 * `allowed_mime_types`/`file_size_limit` and each table's CHECK
 * constraints — not a replacement for them.
 */
export async function validatePdfFile(file: File): Promise<PdfValidationResult> {
  if (file.size <= 0) {
    return { ok: false, message: "The selected file is empty." };
  }
  if (file.size > MAX_PDF_SIZE_BYTES) {
    return { ok: false, message: `The file is too large — the maximum size is ${Math.floor(MAX_PDF_SIZE_BYTES / (1024 * 1024))} MB.` };
  }
  if (file.type && file.type !== "application/pdf") {
    return { ok: false, message: "Only PDF files are accepted." };
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return { ok: false, message: "Only .pdf files are accepted." };
  }

  const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const headerText = new TextDecoder("latin1").decode(header);
  if (headerText !== PDF_MAGIC_BYTES) {
    return { ok: false, message: "This file doesn't look like a valid PDF." };
  }

  return { ok: true };
}

/** SHA-256 hex checksum of the file's bytes — recorded for evidence integrity ("checksum if practical"). */
export async function computeSha256Checksum(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return createHash("sha256").update(buffer).digest("hex");
}

function sanitizeFilenameSegment(originalFilename: string): string {
  const base = originalFilename.replace(/[^a-zA-Z0-9.-]/g, "_");
  return base.length > 0 ? base : "document.pdf";
}

/** {company_id}/meetings/{project_id}/{meeting_id}/{uuid}-{filename} — see the storage migration's path-convention comment. */
export function buildToolboxMeetingObjectPath(companyId: string, projectId: string, meetingId: string, originalFilename: string): string {
  return `${companyId}/meetings/${projectId}/${meetingId}/${crypto.randomUUID()}-${sanitizeFilenameSegment(originalFilename)}`;
}

/** {company_id}/templates/{template_id}/{uuid}-{filename} */
export function buildToolboxTemplateObjectPath(companyId: string, templateId: string, originalFilename: string): string {
  return `${companyId}/templates/${templateId}/${crypto.randomUUID()}-${sanitizeFilenameSegment(originalFilename)}`;
}

/**
 * {company_id}/safety-flash/{project_id|'org'}/{flash_id}/{uuid}-{filename}
 *
 * CRITICAL fix, caught by live testing (role-validation realistic data
 * seed): this previously used the literal segment 'company' for a
 * company-wide (no-project) flash, but the deployed storage RLS policy
 * (supabase/migrations/20260803161000_toolbox_documents_storage.sql,
 * predating the organizations->companies rename) checks for the literal
 * 'org' at this exact path position — never updated when this file's
 * literal was written/renamed. The mismatch meant EVERY company-wide
 * safety flash upload failed storage RLS for EVERY caller, unconditionally
 * — confirmed live, and confirmed zero company-wide safety_flashes rows
 * exist in the database (this path can never have succeeded before).
 * Fixed to match the storage policy's actual, deployed expectation.
 */
export function buildSafetyFlashObjectPath(companyId: string, projectId: string | null, flashId: string, originalFilename: string): string {
  const scopeSegment = projectId ?? "org";
  return `${companyId}/safety-flash/${scopeSegment}/${flashId}/${crypto.randomUUID()}-${sanitizeFilenameSegment(originalFilename)}`;
}

/** Uploads a validated PDF to a freshly-built path. Never upserts — every upload (including a replacement) is a brand-new object, per the bucket's INSERT-only (no UPDATE) storage RLS policy. */
export async function uploadPdfToToolboxBucket(supabase: SupabaseClient, objectPath: string, file: File): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.storage.from(TOOLBOX_DOCUMENTS_BUCKET).upload(objectPath, file, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) {
    return { ok: false, message: "Couldn't upload the file. Try again." };
  }
  return { ok: true };
}

/** A short-lived signed URL for previewing/downloading a stored PDF — never a permanent public URL. */
export async function createToolboxDocumentSignedUrl(supabase: SupabaseClient, objectPath: string, expiresInSeconds = 300): Promise<string | null> {
  const { data, error } = await supabase.storage.from(TOOLBOX_DOCUMENTS_BUCKET).createSignedUrl(objectPath, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}
