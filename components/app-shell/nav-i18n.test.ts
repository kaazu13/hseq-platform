import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { NAV_GROUPS, ALL_NAV_ITEMS } from "./nav-config";
import { LOCALES } from "@/i18n/locale";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import sv from "../../messages/sv.json";
import nb from "../../messages/nb.json";
import ro from "../../messages/ro.json";
import fr from "../../messages/fr.json";
import nl from "../../messages/nl.json";
import de from "../../messages/de.json";
import ru from "../../messages/ru.json";
import lt from "../../messages/lt.json";
import it from "../../messages/it.json";

type MessageTree = { [key: string]: string | MessageTree };
const CATALOGS: Record<(typeof LOCALES)[number], MessageTree> = { en, es, sv, nb, ro, fr, nl, de, ru, lt, it };

/**
 * Task 3 closure — regression test for the raw "Nav.items.yourDashboard.label"
 * bug: nav-main.tsx and breadcrumbs.tsx looked up `items.<id>.label` (a
 * nested path) while messages/*.json's `Nav.items.<id>` is a flat string —
 * next-intl's missing-message fallback renders the literal key path, which
 * is exactly what leaked into the sidebar and breadcrumb UI.
 *
 * Rather than hardcoding today's known-correct lookup path (which would
 * NOT catch a regression if someone reintroduces a mismatched suffix,
 * since the test would just re-encode the same wrong assumption), this
 * reads the ACTUAL lookup pattern out of the two component files' own
 * source and cross-checks THAT against the real message catalog for every
 * locale — so a future edit to either side that breaks the pairing fails
 * here, not silently in the browser.
 */
function extractLookupSuffix(sourcePath: string, prefix: "items" | "groups", interpolationVar: string): string {
  const source = fs.readFileSync(sourcePath, "utf8");
  // Matches e.g. `items.${item.id}` or `items.${item.id}.label` inside a
  // template literal — captures whatever (if anything) follows the
  // interpolation before the closing backtick.
  const pattern = new RegExp(`\`${prefix}\\.\\$\\{${interpolationVar.replace(/\./g, "\\.")}\\}([.\\w]*)\``);
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Could not find a \`${prefix}.\${${interpolationVar}}...\` template literal in ${sourcePath} — has the lookup pattern changed shape? Update this test's regex to match.`);
  }
  return match[1] ?? "";
}

function resolvePath(tree: MessageTree, dottedPath: string): string | MessageTree | undefined {
  let current: string | MessageTree | undefined = tree;
  for (const segment of dottedPath.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = current[segment];
  }
  return current;
}

describe("nav i18n key resolution (regression: raw translation keys in nav)", () => {
  const navMainPath = path.join(__dirname, "nav-main.tsx");
  const breadcrumbsPath = path.join(__dirname, "breadcrumbs.tsx");

  const groupSuffix = extractLookupSuffix(navMainPath, "groups", "group.id");
  const itemSuffixNavMain = extractLookupSuffix(navMainPath, "items", "item.id");
  const itemSuffixBreadcrumbs = extractLookupSuffix(breadcrumbsPath, "items", "current.id");

  test("nav-main.tsx and breadcrumbs.tsx use the identical item lookup suffix", () => {
    // If these ever diverge (e.g. one gets `.label` added back and the
    // other doesn't), that's exactly the kind of silent inconsistency this
    // regression is about — fail loudly instead of only checking one side.
    expect(itemSuffixBreadcrumbs).toBe(itemSuffixNavMain);
  });

  for (const locale of LOCALES) {
    describe(`${locale}.json`, () => {
      test("every NAV_GROUPS group id resolves to a non-empty string via nav-main.tsx's actual lookup path", () => {
        for (const group of NAV_GROUPS) {
          const fullPath = `Nav.groups.${group.id}${groupSuffix}`;
          const resolved = resolvePath(CATALOGS[locale], fullPath);
          expect(typeof resolved, `${locale}.json: "${fullPath}" (group "${group.id}") did not resolve to a string — got ${JSON.stringify(resolved)}`).toBe("string");
          expect((resolved as string).length, `${locale}.json: "${fullPath}" resolved to an empty string`).toBeGreaterThan(0);
          // The literal key path leaking into the resolved value is exactly
          // next-intl's MISSING_MESSAGE fallback behavior — assert it can't
          // happen even if the resolution logic above has its own bug.
          expect(resolved, `${locale}.json: "${fullPath}" resolved to the raw key path itself, not a translation`).not.toBe(fullPath.replace("Nav.", ""));
        }
      });

      test("every ALL_NAV_ITEMS item id resolves to a non-empty string via nav-main.tsx's AND breadcrumbs.tsx's actual lookup paths", () => {
        for (const item of ALL_NAV_ITEMS) {
          if (!item.id) continue; // matches the code's own `item.id ? t(...) : item.label` fallback — untranslated by design, not a regression
          for (const suffix of [itemSuffixNavMain, itemSuffixBreadcrumbs]) {
            const fullPath = `Nav.items.${item.id}${suffix}`;
            const resolved = resolvePath(CATALOGS[locale], fullPath);
            expect(typeof resolved, `${locale}.json: "${fullPath}" (item "${item.id}", label "${item.label}") did not resolve to a string — got ${JSON.stringify(resolved)}`).toBe("string");
            expect((resolved as string).length, `${locale}.json: "${fullPath}" resolved to an empty string`).toBeGreaterThan(0);
            expect(resolved, `${locale}.json: "${fullPath}" resolved to the raw key path itself, not a translation`).not.toBe(fullPath.replace("Nav.", ""));
          }
        }
      });
    });
  }
});
