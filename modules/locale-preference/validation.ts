import { z } from "zod";
import { LOCALES } from "@/i18n/locale";

/** `updateLocale` (Task 3 Part 21/22) — a personal preference, same shape as modules/appearance/validation.ts's updateAppearanceSchema. */
export const updateLocaleSchema = z.object({
  locale: z.enum(LOCALES as unknown as [string, ...string[]]),
});
export type UpdateLocaleInput = z.infer<typeof updateLocaleSchema>;
