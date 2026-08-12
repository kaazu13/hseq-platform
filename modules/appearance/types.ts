import type { Enums } from "@/types/database";

export type ThemeMode = Enums<"theme_mode">;
export type AccentTheme = Enums<"accent_theme">;

export const THEME_MODES: ThemeMode[] = ["light", "dark", "system"];
export const THEME_MODE_LABELS: Record<ThemeMode, string> = { light: "Light", dark: "Dark", system: "System" };

export const ACCENT_THEMES: AccentTheme[] = ["default_blue", "safety_green", "steel_slate", "orange", "indigo_purple"];
export const ACCENT_THEME_LABELS: Record<AccentTheme, string> = {
  default_blue: "Default Blue",
  safety_green: "Safety Green",
  steel_slate: "Steel / Slate",
  orange: "Orange",
  indigo_purple: "Indigo / Purple",
};

/** Swatch color shown next to each accent option in the picker — matches app/globals.css's light-mode `--primary` value for that theme exactly. */
export const ACCENT_THEME_SWATCH: Record<AccentTheme, string> = {
  default_blue: "oklch(0.546 0.245 262.881)",
  safety_green: "oklch(0.552 0.15 145)",
  steel_slate: "oklch(0.42 0.02 250)",
  orange: "oklch(0.63 0.19 45)",
  indigo_purple: "oklch(0.5 0.2 300)",
};
