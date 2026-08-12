import { z } from "zod";
import { THEME_MODES, ACCENT_THEMES } from "./types";

export const updateAppearanceSchema = z.object({
  themeMode: z.enum(THEME_MODES as [string, ...string[]]).optional(),
  accentTheme: z.enum(ACCENT_THEMES as [string, ...string[]]).optional(),
});
export type UpdateAppearanceInput = z.infer<typeof updateAppearanceSchema>;
