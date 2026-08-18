import { describe, expect, test } from "vitest";
import { parse as parseIcu } from "@formatjs/icu-messageformat-parser";
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

// Task 3 closure Part 5 — keys whose value is NOT real ICU MessageFormat.
// `ScaffoldRegister.createdMessage` is passed through next-intl's `t.raw()`
// (see app/(app)/companies/[companyId]/projects/[projectId]/scaffolds/
// page.tsx) specifically so `{param:tag}` survives untouched for
// CreateSuccessToast's own regex-based substitution — real ICU has no
// `{param:x}` syntax (a colon inside an argument name is a parse error), so
// these are deliberately excluded from ICU parsing/argument-matching below
// rather than silently failing every locale.
const NON_ICU_KEYS = new Set<string>(["ScaffoldRegister.createdMessage"]);

type IcuAstNode = { type: number; value?: string; options?: Record<string, { value: IcuAstNode[] }>; children?: IcuAstNode[] };

/** Real ICU MessageFormat parse — throws on malformed syntax (unbalanced braces, invalid plural/select category names, colons in argument names, etc.), not just a naive brace-balance check. */
function parseOrThrow(value: string, context: string): IcuAstNode[] {
  try {
    return parseIcu(value) as IcuAstNode[];
  } catch (error) {
    throw new Error(`${context}: invalid ICU MessageFormat syntax in "${value}" — ${(error as Error).message}`);
  }
}

/** Every argument/number/date/time/select/plural/tag name referenced anywhere in the message, including inside plural/select branches — used to confirm two locales' translations of the same key reference the identical set of interpolated values. */
function extractArgNames(nodes: IcuAstNode[]): Set<string> {
  const names = new Set<string>();
  for (const node of nodes) {
    if ((node.type === 1 || node.type === 2 || node.type === 3 || node.type === 4 || node.type === 5 || node.type === 6 || node.type === 8) && node.value) {
      names.add(node.value);
    }
    if (node.options) {
      for (const branch of Object.values(node.options)) {
        for (const name of extractArgNames(branch.value)) names.add(name);
      }
    }
    if (node.children) {
      for (const name of extractArgNames(node.children)) names.add(name);
    }
  }
  return names;
}

describe("locale message catalogs", () => {
  const baseKeys = flattenKeys(en);

  test("en.json has no empty leaf values", () => {
    for (const [path, value] of baseKeys) {
      expect(value.trim().length, `en.json:${path} is empty`).toBeGreaterThan(0);
    }
  });

  test("en.json — every ICU MessageFormat value parses (real parser, not a substring check)", () => {
    for (const [path, value] of baseKeys) {
      if (NON_ICU_KEYS.has(path)) continue;
      parseOrThrow(value, `en.json:${path}`);
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

      test("every ICU MessageFormat value parses (real parser, not a substring check)", () => {
        for (const [path, value] of keys) {
          if (NON_ICU_KEYS.has(path)) continue;
          parseOrThrow(value, `${locale}.json:${path}`);
        }
      });

      test("references the exact same set of interpolated argument names as en.json for every key", () => {
        for (const [path, baseValue] of baseKeys) {
          if (NON_ICU_KEYS.has(path)) continue;
          const localeValue = keys.get(path);
          if (localeValue === undefined) continue; // already reported by the key-parity test above

          const baseArgs = extractArgNames(parseOrThrow(baseValue, `en.json:${path}`));
          const localeArgs = extractArgNames(parseOrThrow(localeValue, `${locale}.json:${path}`));

          const missing = [...baseArgs].filter((name) => !localeArgs.has(name));
          const extra = [...localeArgs].filter((name) => !baseArgs.has(name));

          expect(missing, `${locale}.json:${path} is missing argument(s) present in en.json: ${missing.join(", ")}`).toEqual([]);
          expect(extra, `${locale}.json:${path} has argument(s) not present in en.json: ${extra.join(", ")}`).toEqual([]);
        }
      });
    });
  }
});
