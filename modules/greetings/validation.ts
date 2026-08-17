import { z } from "zod";

/** Task 3 Part 8 — the strict placeholder allowlist. substitute_greeting_placeholders() in the DB only ever substitutes these three tokens (plain literal replace, never eval'd) — this schema catches a typo'd/unknown placeholder client- and server-side with a clear message, rather than letting it render literally as "{{whatever}}" in the sent notification. */
const ALLOWED_PLACEHOLDERS = ["first_name", "last_name", "company_name"];

function hasOnlyAllowedPlaceholders(value: string): boolean {
  const matches = [...value.matchAll(/\{\{(\w+)\}\}/g)];
  return matches.every((match) => ALLOWED_PLACEHOLDERS.includes(match[1]));
}

export const updateGreetingSettingSchema = z.object({
  enabled: z.boolean(),
  messageTemplate: z
    .string()
    .trim()
    .min(1, "Message is required")
    .max(2000, "Keep it under 2000 characters")
    .refine(hasOnlyAllowedPlaceholders, `Only these placeholders are allowed: ${ALLOWED_PLACEHOLDERS.map((p) => `{{${p}}}`).join(", ")}`),
});
export type UpdateGreetingSettingInput = z.infer<typeof updateGreetingSettingSchema>;
