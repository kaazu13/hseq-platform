import { imageSize } from "image-size";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Upload/validation helpers for the `company-logos` Storage bucket (Phase
 * 15-16). Same "validate before it's ever uploaded" discipline as
 * lib/storage/toolbox-documents.ts's validatePdfFile(), but for images:
 * MIME type, extension, size, actual decoded format/dimensions (via
 * `image-size` — a pure-JS, no-native-binary decoder chosen specifically
 * so a renamed/spoofed file is still caught without needing a native
 * image-processing toolchain like sharp in this environment), and a
 * pixel-dimension ceiling. This is defense-in-depth on top of the
 * bucket's own `allowed_mime_types`/`file_size_limit` — not a replacement
 * for them.
 *
 * SVG is deliberately never accepted — it can contain active content
 * (script/foreignObject), and this codebase has no sanitization pipeline
 * for it (matches this milestone's explicit "do NOT support SVG uploads
 * unless there is a strong sanitized pipeline" instruction).
 */

export const COMPANY_LOGOS_BUCKET = "company-logos";
export const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB — "do not allow arbitrary 100MB images"
export const MAX_LOGO_DIMENSION_PX = 4000; // sane ceiling; UI renders logos in a small bounded container regardless

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ALLOWED_DECODED_TYPES = new Set(["png", "jpg", "webp"]);

export type LogoValidationResult = { ok: true; width: number; height: number } | { ok: false; message: string };

export async function validateCompanyLogoFile(file: File): Promise<LogoValidationResult> {
  if (file.size <= 0) {
    return { ok: false, message: "The selected file is empty." };
  }
  if (file.size > MAX_LOGO_SIZE_BYTES) {
    return { ok: false, message: `The file is too large — the maximum size is ${Math.floor(MAX_LOGO_SIZE_BYTES / (1024 * 1024))} MB.` };
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { ok: false, message: "Only PNG, JPEG, or WebP images are accepted." };
  }

  let decoded: ReturnType<typeof imageSize>;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    decoded = imageSize(bytes);
  } catch {
    return { ok: false, message: "This file doesn't look like a valid image." };
  }

  if (!decoded.type || !ALLOWED_DECODED_TYPES.has(decoded.type)) {
    return { ok: false, message: "This file doesn't look like a valid PNG, JPEG, or WebP image." };
  }
  if (decoded.width <= 0 || decoded.height <= 0) {
    return { ok: false, message: "This file doesn't look like a valid image." };
  }
  if (decoded.width > MAX_LOGO_DIMENSION_PX || decoded.height > MAX_LOGO_DIMENSION_PX) {
    return { ok: false, message: `The image is too large — the maximum dimension is ${MAX_LOGO_DIMENSION_PX}px.` };
  }

  return { ok: true, width: decoded.width, height: decoded.height };
}

const EXTENSION_BY_MIME: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** `{company_id}/{random}.{ext}` — no user-controlled filename segment at all (unlike toolbox-documents, which keeps the original filename for human readability; a logo has no meaningful "filename" to preserve), avoiding any path-injection/collision surface entirely. */
export function buildCompanyLogoObjectPath(companyId: string, mimeType: string): string {
  const ext = EXTENSION_BY_MIME[mimeType] ?? "png";
  return `${companyId}/${crypto.randomUUID()}.${ext}`;
}

/** Uploads an already-validated logo file to the given object path — "replace old logo safely" is handled by the caller deleting the previous object path after this succeeds (see modules/companies/actions.ts's uploadCompanyLogo), never overwriting in place. */
export async function uploadCompanyLogo(supabase: SupabaseClient, objectPath: string, file: File): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.storage.from(COMPANY_LOGOS_BUCKET).upload(objectPath, file, { contentType: file.type, upsert: false });
  if (error) {
    return { ok: false, message: "Couldn't upload the logo. Try again." };
  }
  return { ok: true };
}

/** Removes an orphaned/replaced logo object — best-effort (a failure here shouldn't block the rest of the mutation that called it). */
export async function removeCompanyLogo(supabase: SupabaseClient, objectPath: string): Promise<void> {
  await supabase.storage.from(COMPANY_LOGOS_BUCKET).remove([objectPath]);
}

/** The bucket is public-read, so this is a stable, non-expiring URL — no signed-URL minting needed (see the storage migration's header comment for why a logo is treated differently from a confidential toolbox document). */
export function getCompanyLogoPublicUrl(supabase: SupabaseClient, objectPath: string): string {
  return supabase.storage.from(COMPANY_LOGOS_BUCKET).getPublicUrl(objectPath).data.publicUrl;
}
