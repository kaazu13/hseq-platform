/**
 * Pure helpers for nav-main.tsx's collapsed-group persistence — split out
 * so the parsing/serialization logic is unit-testable without a DOM
 * (this project's vitest config is Node-only, no jsdom/testing-library —
 * see vitest.config.ts's header comment — so anything touching
 * `window`/React rendering directly can't be unit tested here; these
 * functions deliberately don't touch `window` themselves).
 */

/** Parses the raw localStorage value into the set of collapsed group labels. Never throws — malformed/missing/tampered storage just means "nothing collapsed" (fully expanded), the same safe default as a first-ever visit. */
export function parseCollapsedGroups(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((v): v is string => typeof v === "string")) : new Set();
  } catch {
    return new Set();
  }
}

export function serializeCollapsedGroups(collapsed: Set<string>): string {
  return JSON.stringify([...collapsed]);
}

/** The effective open/closed state for a group: always open if it contains the active route, regardless of what's stored; otherwise open unless the user explicitly collapsed it. */
export function isGroupOpen(groupLabel: string, isActiveGroup: boolean, collapsed: Set<string>): boolean {
  return isActiveGroup || !collapsed.has(groupLabel);
}
