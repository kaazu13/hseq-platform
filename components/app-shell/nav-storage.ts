/**
 * `localStorage`-backed external store for nav-main.tsx's collapsed-group
 * preference, read via `useSyncExternalStore` rather than
 * `useState`+`useEffect` — the latter trips
 * `react-hooks/set-state-in-effect` (calling `setState` synchronously
 * inside an effect body) since hydrating client state from a browser-only
 * API on mount is exactly the "subscribe to an external system" case
 * `useSyncExternalStore` exists for. `getServerSnapshot` returns `""`
 * (nothing collapsed) so the server render and the pre-hydration client
 * render agree — no hydration mismatch, no flash beyond React's normal
 * one-time re-render once the real snapshot is read after mount.
 */

const STORAGE_KEY = "hseq-nav-collapsed-groups";
const listeners = new Set<() => void>();

export function subscribeToCollapsedGroups(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getCollapsedGroupsSnapshot(): string {
  return window.localStorage.getItem(STORAGE_KEY) ?? "";
}

export function getCollapsedGroupsServerSnapshot(): string {
  return "";
}

export function writeCollapsedGroups(serialized: string): void {
  window.localStorage.setItem(STORAGE_KEY, serialized);
  for (const listener of listeners) listener();
}
