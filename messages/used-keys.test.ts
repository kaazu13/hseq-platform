import { describe, expect, test } from "vitest";
import path from "node:path";
import { scanTranslationUsages, type DynamicUsage } from "@/i18n/scan-translation-usages";
import { ROLE_NAMES } from "@/modules/companies/types";
import { PROJECT_ASSIGNMENT_ROLES } from "@/modules/projects/types";
import { MEMBERSHIP_STATUSES } from "@/modules/account/types";
import { THEME_MODES, ACCENT_THEMES } from "@/modules/appearance/types";
import en from "./en.json";

/**
 * The localization regression this file exists to catch: commit 2119fd8
 * shipped `Account.myRateRequests`/`Account.requestedRate` (and 3 more
 * Account keys, plus 8 `MyHours` earnings keys) referenced by real
 * `t("key")` call sites that were never added to en.json or any other
 * locale — `messages/locales.test.ts` never caught this because it only
 * ever compares locale files AGAINST EACH OTHER (parity + ICU-argument
 * matching); nothing previously compared the code's actual call sites
 * against the catalog at all.
 *
 * This file closes that gap: `scanTranslationUsages()` (a real TypeScript
 * AST walk, not a regex — see its own header comment for why) finds
 * every `getTranslations`/`useTranslations`-bound call site across
 * `app/`, `modules/`, and `components/`, and this suite fails the build
 * the moment one references a namespace.key that doesn't exist in
 * en.json (the source-of-truth locale — `locales.test.ts` already
 * guarantees every other locale has the identical key set, so checking
 * against en.json alone is sufficient here).
 */
const REPO_ROOT = path.resolve(__dirname, "..");
const SCAN_DIRS = ["app", "modules", "components"];

type MessageTree = { [key: string]: string | MessageTree };

function flattenKeys(tree: MessageTree, prefix = ""): Set<string> {
  const out = new Set<string>();
  for (const [key, value] of Object.entries(tree)) {
    const path_ = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.add(path_);
    else for (const nested of flattenKeys(value, path_)) out.add(nested);
  }
  return out;
}

const enKeys = flattenKeys(en as MessageTree);
const scan = scanTranslationUsages(SCAN_DIRS, REPO_ROOT);

/**
 * Part 3's "dynamic keys ... validate them through canonical mapping
 * tests instead." Each entry is one `{file, namespace, staticPrefix}`
 * combination the scanner found a template-literal key at (e.g.
 * `` tr(`tabs.${key}`) ``) — a template can't be resolved to a single
 * literal key statically, so instead this registry declares the FULL set
 * of concrete keys that prefix can ever expand to (sourced from the same
 * exported constant/type the calling code actually iterates — ROLE_NAMES,
 * a local `as const` array, a type union — never re-guessed from
 * whatever en.json already happens to contain, which would be circular
 * and would never catch a newly-added role/status/state missing its
 * label). `coveredByOtherTest` marks a combination whose keys are
 * already exhaustively verified by a DIFFERENT, more specific test file
 * (Nav's three sites are fully covered by nav-i18n.test.ts, which walks
 * the real NAV_GROUPS/ALL_NAV_ITEMS structures — duplicating that here
 * would just be a second, weaker copy of the same check).
 *
 * Any dynamic call site NOT listed here fails the "every dynamic usage
 * is registered" test below — a new template-literal `t(...)` call must
 * be added here (with its real expected key set) or explicitly delegated,
 * never silently left unchecked.
 */
type DynamicKeyEntry = { file: string; namespace: string; staticPrefix: string; expectedKeys?: string[]; coveredByOtherTest?: string };

const DYNAMIC_KEY_REGISTRY: DynamicKeyEntry[] = [
  { file: "app/(app)/account/page.tsx", namespace: "AccountLabels", staticPrefix: "roles.", expectedKeys: ROLE_NAMES.map((role) => `roles.${role}`) },
  { file: "app/(app)/account/page.tsx", namespace: "AccountLabels", staticPrefix: "membershipStatus.", expectedKeys: MEMBERSHIP_STATUSES.map((status) => `membershipStatus.${status}`) },
  { file: "app/(app)/account/page.tsx", namespace: "AccountLabels", staticPrefix: "projectRole.", expectedKeys: PROJECT_ASSIGNMENT_ROLES.map((role) => `projectRole.${role}`) },
  {
    file: "app/(app)/companies/[companyId]/projects/[projectId]/equipment/page.tsx",
    namespace: "Equipment",
    staticPrefix: "expiryFilters.",
    // Matches the page's own local `(["all", "expiring_soon", "expired"] as const)` filter list.
    expectedKeys: ["expiryFilters.all", "expiryFilters.expiring_soon", "expiryFilters.expired"],
  },
  {
    file: "app/(app)/companies/[companyId]/projects/[projectId]/equipment/page.tsx",
    namespace: "Equipment",
    staticPrefix: "tabs.",
    // Matches the page's own local TABS array.
    expectedKeys: ["tabs.overview", "tabs.catalog", "tabs.inventory", "tabs.issued", "tabs.requests", "tabs.expiring", "tabs.history"],
  },
  {
    file: "app/(app)/companies/[companyId]/projects/[projectId]/leave/page.tsx",
    namespace: "LeaveManagement",
    staticPrefix: "tabs.",
    // Matches the page's own local STATUS_TAB_KEYS array.
    expectedKeys: ["tabs.pending", "tabs.approved", "tabs.returned", "tabs.denied", "tabs.all"],
  },
  // InspectionDashboard.state / .chartBucket — mirrors modules/scaffolds/inspection-health.ts's
  // InspectionHealthState/InspectionHealthBucket type unions (not exported as a runtime const
  // array, so hardcoded here with that source cited rather than re-derived from en.json).
  {
    file: "app/(app)/companies/[companyId]/projects/[projectId]/scaffold-inspection-dashboard/page.tsx",
    namespace: "InspectionDashboard",
    staticPrefix: "state.",
    expectedKeys: ["state.dismantled", "state.awaiting_initial", "state.expired", "state.due_today", "state.expiring_tomorrow", "state.valid"],
  },
  {
    file: "app/(app)/companies/[companyId]/projects/[projectId]/scaffold-inspection-dashboard/page.tsx",
    namespace: "InspectionDashboard",
    staticPrefix: "chartBucket.",
    expectedKeys: ["chartBucket.green", "chartBucket.orange", "chartBucket.red", "chartBucket.gray"],
  },
  {
    file: "app/(app)/companies/[companyId]/projects/[projectId]/scaffold-map/page.tsx",
    namespace: "InspectionDashboard",
    staticPrefix: "state.",
    expectedKeys: ["state.dismantled", "state.awaiting_initial", "state.expired", "state.due_today", "state.expiring_tomorrow", "state.valid"],
  },
  {
    file: "app/(app)/companies/[companyId]/projects/[projectId]/scaffolds/[scaffoldId]/page.tsx",
    namespace: "InspectionDashboard",
    staticPrefix: "state.",
    expectedKeys: ["state.dismantled", "state.awaiting_initial", "state.expired", "state.due_today", "state.expiring_tomorrow", "state.valid"],
  },
  {
    file: "modules/scaffolds/components/inspector-dashboard-section.tsx",
    namespace: "InspectionDashboard",
    staticPrefix: "state.",
    expectedKeys: ["state.dismantled", "state.awaiting_initial", "state.expired", "state.due_today", "state.expiring_tomorrow", "state.valid"],
  },
  {
    file: "modules/scaffolds/components/scaffold-health-quick-filters.tsx",
    namespace: "InspectionDashboard",
    staticPrefix: "state.",
    expectedKeys: ["state.dismantled", "state.awaiting_initial", "state.expired", "state.due_today", "state.expiring_tomorrow", "state.valid"],
  },
  { file: "modules/appearance/components/appearance-section.tsx", namespace: "Appearance", staticPrefix: "themeMode.", expectedKeys: THEME_MODES.map((mode) => `themeMode.${mode}`) },
  { file: "modules/appearance/components/appearance-section.tsx", namespace: "Appearance", staticPrefix: "accent.", expectedKeys: ACCENT_THEMES.map((accent) => `accent.${accent}`) },
  {
    file: "modules/scaffolds/components/scaffold-form.tsx",
    namespace: "ScaffoldWizard",
    staticPrefix: "step.",
    // Matches the component's own local STEP_KEYS = ["information", "crew", "inspectionLocation", "review"] as const.
    expectedKeys: ["step.information", "step.crew", "step.inspectionLocation", "step.review"],
  },
  {
    file: "modules/scaffolds/components/scaffold-map-page-client.tsx",
    namespace: "ScaffoldMap",
    staticPrefix: "filters.",
    // Matches the component's own local FILTER_ORDER: FilterKey[].
    expectedKeys: ["filters.all_active", "filters.valid", "filters.attention_today", "filters.tomorrow", "filters.awaiting_initial"],
  },
  {
    file: "modules/worked-hours/components/my-hours-month-calendar.tsx",
    namespace: "MyHours",
    staticPrefix: "weekday.",
    expectedKeys: ["weekday.mon", "weekday.tue", "weekday.wed", "weekday.thu", "weekday.fri", "weekday.sat", "weekday.sun"],
  },
  { file: "components/app-shell/breadcrumbs.tsx", namespace: "Nav", staticPrefix: "items.", coveredByOtherTest: "components/app-shell/nav-i18n.test.ts" },
  { file: "components/app-shell/nav-main.tsx", namespace: "Nav", staticPrefix: "groups.", coveredByOtherTest: "components/app-shell/nav-i18n.test.ts" },
  { file: "components/app-shell/nav-main.tsx", namespace: "Nav", staticPrefix: "items.", coveredByOtherTest: "components/app-shell/nav-i18n.test.ts" },
];

function registryKey(entry: { file: string; namespace: string; staticPrefix: string }): string {
  return `${entry.file}|${entry.namespace}|${entry.staticPrefix}`;
}

/**
 * Calls whose key argument isn't a string/template literal at all (e.g.
 * `t(someVariable)`) can't be resolved statically in either direction —
 * not proven correct, not provably wrong. Rather than silently ignoring
 * them (which is what happened before this file existed), each site must
 * be explicitly acknowledged here; a NEW opaque site fails the test below
 * until a human either adds it here (with a reason) or refactors it to a
 * literal/template key this suite CAN check.
 */
type OpaqueEntry = { file: string; namespace: string; boundVar: string; reason: string };

const KNOWN_OPAQUE_USAGES: OpaqueEntry[] = [
  { file: "app/(app)/account/page.tsx", namespace: "AccountLabels", boundVar: "tLabels", reason: "key is a template with no static prefix at all (a bare variable) — resolved at runtime from an already-validated enum value." },
  {
    file: "app/(app)/companies/[companyId]/projects/[projectId]/scaffold-inspection-dashboard/page.tsx",
    namespace: "InspectionDashboard",
    boundVar: "t",
    reason: "key comes from a variable holding an already-validated InspectionHealthState value.",
  },
  { file: "modules/account/components/preferences-summary-card.tsx", namespace: "Appearance", boundVar: "tAppearance", reason: "key comes from a variable holding an already-validated ThemeMode/AccentTheme value." },
  { file: "modules/scaffolds/components/scaffold-form.tsx", namespace: "ScaffoldInspectionFrequency", boundVar: "t", reason: "key comes from a variable holding an already-validated inspection-frequency value." },
];

function opaqueKey(entry: { file: string; namespace: string; boundVar: string }): string {
  return `${entry.file}|${entry.namespace}|${entry.boundVar}`;
}

describe("code-referenced translation keys (used-key validation)", () => {
  test("the scanner actually found translation call sites (sanity check — a zero result means the AST walk silently broke)", () => {
    expect(scan.literalUsages.length).toBeGreaterThan(100);
  });

  test("every literal t(\"key\")/tr(\"key\") call site resolves to a real key in en.json", () => {
    const missing = scan.literalUsages.filter((usage) => !enKeys.has(`${usage.namespace}.${usage.key}`));
    const report = missing.map((u) => `${u.file}:${u.line}  ${u.namespace}.${u.key}`);
    expect(report, `${missing.length} call site(s) reference a key missing from en.json:\n${report.join("\n")}`).toEqual([]);
  });

  test("every dynamic (template-literal-key) call site is registered in DYNAMIC_KEY_REGISTRY", () => {
    const registeredKeys = new Set(DYNAMIC_KEY_REGISTRY.map(registryKey));
    const unregistered = scan.dynamicUsages.filter((usage) => !registeredKeys.has(registryKey(usage)));
    const report = unregistered.map((u: DynamicUsage) => `${u.file}:${u.line}  ${u.namespace} \`${u.templateText}\``);
    expect(
      report,
      `${unregistered.length} dynamic-key call site(s) are not covered by DYNAMIC_KEY_REGISTRY in messages/used-keys.test.ts — add an entry with the real expected key set (or a coveredByOtherTest delegation):\n${report.join("\n")}`,
    ).toEqual([]);
  });

  test("every DYNAMIC_KEY_REGISTRY entry's expected keys actually resolve in en.json", () => {
    const failures: string[] = [];
    for (const entry of DYNAMIC_KEY_REGISTRY) {
      if (entry.coveredByOtherTest || !entry.expectedKeys) continue;
      for (const key of entry.expectedKeys) {
        const fullKey = `${entry.namespace}.${key}`;
        if (!enKeys.has(fullKey)) failures.push(`${entry.file} (${entry.namespace}.${entry.staticPrefix}*): missing en.json key "${fullKey}"`);
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  test("every DYNAMIC_KEY_REGISTRY entry still corresponds to an actual call site (no stale entries)", () => {
    const actualKeys = new Set(scan.dynamicUsages.map(registryKey));
    const stale = DYNAMIC_KEY_REGISTRY.filter((entry) => !actualKeys.has(registryKey(entry)));
    const report = stale.map((e) => `${e.file}  ${e.namespace} \`${e.staticPrefix}*\` — no longer referenced anywhere; remove this registry entry`);
    expect(report, report.join("\n")).toEqual([]);
  });

  test("every opaque (non-literal key argument) call site is explicitly acknowledged in KNOWN_OPAQUE_USAGES", () => {
    const knownKeys = new Set(KNOWN_OPAQUE_USAGES.map(opaqueKey));
    const unacknowledged = scan.opaqueUsages.filter((usage) => !knownKeys.has(opaqueKey(usage)));
    const report = unacknowledged.map((u) => `${u.file}:${u.line}  ${u.namespace} (${u.boundVar})`);
    expect(
      report,
      `${unacknowledged.length} call site(s) pass a non-literal, non-template key that can't be statically checked in either direction — add to KNOWN_OPAQUE_USAGES with a reason, or refactor to a literal/template key:\n${report.join("\n")}`,
    ).toEqual([]);
  });
});
