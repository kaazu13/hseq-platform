import { describe, expect, test } from "vitest";
import { LOCALES, DEFAULT_LOCALE } from "@/i18n/locale";
import en from "./en.json";
import es from "./es.json";
import sv from "./sv.json";
import nb from "./nb.json";
import ro from "./ro.json";
import fr from "./fr.json";
import nl from "./nl.json";
import de from "./de.json";
import ru from "./ru.json";
import lt from "./lt.json";
import it from "./it.json";

type MessageTree = { [key: string]: string | MessageTree };

const CATALOGS: Record<(typeof LOCALES)[number], MessageTree> = { en, es, sv, nb, ro, fr, nl, de, ru, lt, it };

/**
 * Task 3 Part 26 — translation-completeness tests. `en.json` (DEFAULT_LOCALE)
 * is the source of truth for which keys must exist; every other locale is
 * checked structurally against it so a translator adding/renaming a key in
 * one file without updating the other 10 fails CI instead of surfacing as a
 * runtime MISSING_MESSAGE error or a silently-untranslated string in prod.
 */
function flattenKeys(tree: MessageTree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      out.set(path, value);
    } else {
      for (const [nestedPath, nestedValue] of flattenKeys(value, path)) {
        out.set(nestedPath, nestedValue);
      }
    }
  }
  return out;
}

// ICU argument names that must appear verbatim in every locale's translation
// of these specific keys — hand-listed rather than regex-extracted from
// arbitrary ICU syntax, since a generic `{(\w+)` scan false-matches on plain
// text immediately following a plural category brace (e.g. "=0 {No unread…}"
// would otherwise look like an argument named "No"). This list only needs to
// grow when a new interpolated/pluralized key is added to en.json.
const REQUIRED_ARGS: Record<string, string[]> = {
  "LanguageRegion.previewDate": ["{date,"],
  "LanguageRegion.previewNumber": ["{value,"],
  "LanguageRegion.unreadNotifications": ["{count,", "other {"],
};

describe("locale message catalogs", () => {
  const baseKeys = flattenKeys(en);

  test("en.json has no empty leaf values", () => {
    for (const [path, value] of baseKeys) {
      expect(value.trim().length, `en.json:${path} is empty`).toBeGreaterThan(0);
    }
  });

  test("every configured locale has a catalog", () => {
    for (const locale of LOCALES) {
      expect(CATALOGS[locale], `no catalog registered for locale "${locale}"`).toBeDefined();
    }
  });

  for (const locale of LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;

    describe(`${locale}.json`, () => {
      const keys = flattenKeys(CATALOGS[locale]);

      test("has exactly the same key paths as en.json", () => {
        const baseKeySet = new Set(baseKeys.keys());
        const localeKeySet = new Set(keys.keys());

        const missing = [...baseKeySet].filter((path) => !localeKeySet.has(path));
        const extra = [...localeKeySet].filter((path) => !baseKeySet.has(path));

        expect(missing, `${locale}.json is missing keys present in en.json`).toEqual([]);
        expect(extra, `${locale}.json has keys not present in en.json`).toEqual([]);
      });

      test("has no empty leaf values", () => {
        for (const [path, value] of keys) {
          expect(value.trim().length, `${locale}.json:${path} is empty`).toBeGreaterThan(0);
        }
      });

      test("preserves required ICU argument placeholders", () => {
        for (const [path, requiredSubstrings] of Object.entries(REQUIRED_ARGS)) {
          const value = keys.get(path);
          expect(value, `${locale}.json is missing key "${path}" required for ICU argument check`).toBeDefined();
          for (const substring of requiredSubstrings) {
            expect(value, `${locale}.json:${path} must contain "${substring}"`).toContain(substring);
          }
        }
      });
    });
  }
});
