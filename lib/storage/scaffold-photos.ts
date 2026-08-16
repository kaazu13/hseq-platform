import { imageSize } from "image-size";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SCAFFOLD_PHOTO_MAX_SIZE_BYTES } from "@/modules/scaffolds/types";

/**
 * Upload/validation helpers for the `scaffold-photos` Storage bucket
 * (Part 4F of the post-audit implementation package) — same
 * "validate before it's ever uploaded" discipline as
 * lib/storage/company-logos.ts's validateCompanyLogoFile() (MIME type,
 * extension, size, actual decoded format/dimensions via the pure-JS
 * `image-size` decoder so a renamed/spoofed file is still caught), but
 * PRIVATE (unlike company logos) — completion photos are internal
 * evidence, never publicly addressable, so viewing always goes through a
 * short-lived signed URL minted server-side (getScaffoldPhotoSignedUrl
 * below), never a stable public URL.
 *
 * SVG is deliberately never accepted (same reasoning as company logos —
 * no sanitization pipeline exists for active content in this codebase).
 * HEIC/HEIF is also deliberately rejected: no library in this stack can
 * safely decode/validate/render it (confirmed — no `heic-decode`/similar
 * dependency exists), and silently accepting an unreadable file would be
 * worse than a clear, immediate rejection message.
 */

export const SCAFFOLD_PHOTOS_BUCKET = "scaffold-photos";
export const MAX_SCAFFOLD_PHOTO_DIMENSION_PX = 8000; // generous ceiling for a real phone-camera photo; still bounded against a decompression-bomb-style pixel count

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_DECODED_TYPES = new Set(["jpg", "png", "webp"]);
const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif"]);

export type ScaffoldPhotoValidationResult = { ok: true; width: number; height: number } | { ok: false; message: string };

export async function validateScaffoldPhotoFile(file: File): Promise<ScaffoldPhotoValidationResult> {
  if (file.size <= 0) {
    return { ok: false, message: "The selected file is empty." };
  }
  if (file.size > SCAFFOLD_PHOTO_MAX_SIZE_BYTES) {
    return { ok: false, message: `The file is too large — the maximum size is ${Math.floor(SCAFFOLD_PHOTO_MAX_SIZE_BYTES / (1024 * 1024))} MB.` };
  }
  if (HEIC_MIME_TYPES.has(file.type) || /\.hei[cf]$/i.test(file.name)) {
    return { ok: false, message: "HEIC/HEIF photos aren't supported yet — please choose JPEG, PNG, or WebP (most phones can also save/export in JPEG)." };
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { ok: false, message: "Only JPEG, PNG, or WebP images are accepted." };
  }

  let decoded: ReturnType<typeof imageSize>;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    decoded = imageSize(bytes);
  } catch {
    return { ok: false, message: "This file doesn't look like a valid image." };
  }

  if (!decoded.type || !ALLOWED_DECODED_TYPES.has(decoded.type)) {
    return { ok: false, message: "This file doesn't look like a valid JPEG, PNG, or WebP image." };
  }
  if (decoded.width <= 0 || decoded.height <= 0) {
    return { ok: false, message: "This file doesn't look like a valid image." };
  }
  if (decoded.width > MAX_SCAFFOLD_PHOTO_DIMENSION_PX || decoded.height > MAX_SCAFFOLD_PHOTO_DIMENSION_PX) {
    return { ok: false, message: `The image is too large — the maximum dimension is ${MAX_SCAFFOLD_PHOTO_DIMENSION_PX}px.` };
  }

  return { ok: true, width: decoded.width, height: decoded.height };
}

const EXTENSION_BY_MIME: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** `{company_id}/{project_id}/{scaffold_id}/{uuid}.{ext}` — no user-controlled filename segment at all (matches company-logos' "a photo has no meaningful filename worth preserving" reasoning; the original filename is still recorded in scaffold_photos.original_filename for display, just never used to address the object). */
export function buildScaffoldPhotoObjectPath(companyId: string, projectId: string, scaffoldId: string, mimeType: string): string {
  const ext = EXTENSION_BY_MIME[mimeType] ?? "jpg";
  return `${companyId}/${projectId}/${scaffoldId}/${crypto.randomUUID()}.${ext}`;
}

export async function uploadScaffoldPhoto(supabase: SupabaseClient, objectPath: string, file: File): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.storage.from(SCAFFOLD_PHOTOS_BUCKET).upload(objectPath, file, { contentType: file.type, upsert: false });
  if (error) {
    return { ok: false, message: "Couldn't upload the photo. Try again." };
  }
  return { ok: true };
}

/** Best-effort cleanup of an orphaned object (e.g. the storage upload succeeded but the scaffold_photos row insert then failed — a partial-batch failure must never leave a DB row with no backing object, or a paid-for-but-unreferenced object; see modules/scaffolds/photo-actions.ts). A failure here is swallowed — a harmless orphaned object is preferable to surfacing a second error on top of the original one. */
export async function removeScaffoldPhotoObject(supabase: SupabaseClient, objectPath: string): Promise<void> {
  await supabase.storage.from(SCAFFOLD_PHOTOS_BUCKET).remove([objectPath]);
}

/** Short-lived (60s) signed URL for authenticated internal viewing — this bucket is private and has no public/anon access at all (unlike company-logos), so every render mints a fresh URL rather than storing/reusing a long-lived one. 60s is enough for the browser to load the image; a leaked URL from a screenshot/devtools becomes worthless almost immediately. */
export async function getScaffoldPhotoSignedUrl(supabase: SupabaseClient, objectPath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(SCAFFOLD_PHOTOS_BUCKET).createSignedUrl(objectPath, 60);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Batched form of getScaffoldPhotoSignedUrl — one Storage API call for up to 30 paths (a scaffold's full gallery) instead of 30 sequential round trips (performance pass, completion package Part 5). Returns a Map keyed by the input path; a path that failed to sign is simply absent from the map rather than throwing, matching the singular function's null-on-failure behavior. */
export async function getScaffoldPhotoSignedUrls(supabase: SupabaseClient, objectPaths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (objectPaths.length === 0) return result;
  const { data, error } = await supabase.storage.from(SCAFFOLD_PHOTOS_BUCKET).createSignedUrls(objectPaths, 60);
  if (error || !data) return result;
  for (const entry of data) {
    if (!entry.error && entry.signedUrl) result.set(entry.path ?? "", entry.signedUrl);
  }
  return result;
}
