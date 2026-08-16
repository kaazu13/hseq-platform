/**
 * Client-side photo resize/compression before upload — no image-processing
 * dependency exists in this stack (only the server-side `image-size`
 * decoder for dimension/type verification), so this uses the browser's own
 * `createImageBitmap` + Canvas instead of adding one. Two things fall out
 * of the same re-encode for free: `imageOrientation: "from-image"` bakes
 * EXIF rotation into the actual pixels (so the photo displays correctly
 * everywhere, not just in viewers that honor the EXIF tag), and re-encoding
 * to a fresh JPEG via `toBlob` drops all other EXIF/metadata (GPS, device
 * info) along with it — nothing here is a deliberate metadata-stripping
 * step, it is just what a canvas re-encode inherently produces.
 *
 * Runs only in the browser (`"use client"` callers) — never imported from
 * server code.
 */
const MAX_DIMENSION_DEFAULT = 2000;
const JPEG_QUALITY_DEFAULT = 0.85;

export async function resizeImageForUpload(file: File, maxDimension = MAX_DIMENSION_DEFAULT, quality = JPEG_QUALITY_DEFAULT): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Not decodable by the browser (or an environment without createImageBitmap) — fall back to the original file untouched; server-side validation is the real gate either way.
    return file;
  }

  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) return file;

  const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], newName, { type: "image/jpeg" });
}
