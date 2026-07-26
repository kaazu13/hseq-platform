import { z } from "zod";

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
 */
export const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === "" || value === undefined ? undefined : value));

export const optionalDate = optionalText.pipe(
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
    .optional(),
);
