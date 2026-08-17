/**
 * Task 3 Part 21 — the 11 supported locales. Kept separate from
 * i18n/request.ts (which does the actual per-request resolution) so both
 * server config and client components (the language selector, Part 22) can
 * import this one small, dependency-free file without pulling in
 * next-intl's server-only request machinery.
 */
export const LOCALES = ["en", "es", "sv", "nb", "ro", "fr", "nl", "de", "ru", "lt", "it"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Each language's OWN name for itself (never translated through the active locale — a language picker always shows every option in its own language, a standard i18n UX convention). */
export const LOCALE_NATIVE_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Español",
  sv: "Svenska",
  nb: "Norsk (Bokmål)",
  ro: "Română",
  fr: "Français",
  nl: "Nederlands",
  de: "Deutsch",
  ru: "Русский",
  lt: "Lietuvių",
  it: "Italiano",
};

export function isSupportedLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
