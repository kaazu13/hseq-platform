import { z } from "zod";
import { isValidE164 } from "@/lib/phone";

/**
 * Shared Zod primitives for Server Function form validation
 * (docs/API_CONVENTIONS.md §5) — previously redeclared identically in every
 * domain module's validation.ts file; extracted here so a fourth/fifth
 * module's form schema doesn't retype the same transform.
 *
 * Every optional text field treats an empty string the same as "not
 * provided" (HTML form inputs always submit `""`, never `undefined`, when
 * left blank) — trimmed and transformed to `undefined` before any further
 * validation runs.
 *
 * `DEFAULT_TEXT_MAX_LENGTH` bounds every caller of `optionalText` that
 * doesn't layer its own stricter limit on top — a platform-wide input-size
 * backstop (Phase 11 audit) so a genuinely unbounded free-text field never
 * exists by omission. No field on this platform legitimately needs a note/
 * reason/comment longer than this (documents are uploaded as files, never
 * typed as text) — a module with a real reason to differ can still
 * `.pipe(z.string().max(N))` a tighter bound, matching
 * modules/lmra/validation.ts's optionalNotes() convention.
 */
export const DEFAULT_TEXT_MAX_LENGTH = 5000;

export const optionalText = z
  .string()
  .trim()
  .max(DEFAULT_TEXT_MAX_LENGTH, `Keep it under ${DEFAULT_TEXT_MAX_LENGTH} characters`)
  .optional()
  .transform((value) => (value === "" || value === undefined ? undefined : value));

export const optionalDate = optionalText.pipe(
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
    .optional(),
);

/** An E.164 phone string ("+15551234567") or nothing — the client-side PhoneInput (lib/phone.ts) is what actually converts a national number to this shape; this only re-validates the format server-side (matches the profiles_phone_e164 DB constraint). */
export const optionalE164Phone = optionalText.pipe(z.string().refine(isValidE164, "Enter a valid phone number").optional());
