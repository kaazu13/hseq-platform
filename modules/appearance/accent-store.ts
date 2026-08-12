/**
 * `<html data-accent-theme>`-backed external store for
 * appearance-section.tsx's accent picker, read via `useSyncExternalStore`
 * rather than `useState`+`useEffect` — mirrors components/app-shell/
 * nav-storage.ts's exact reasoning (`react-hooks/set-state-in-effect`):
 * hydrating client state from a browser-only DOM read on mount is exactly
 * the "subscribe to an external system" case `useSyncExternalStore`
 * exists for. `getServerSnapshot` returns `"default_blue"`, matching
 * app/layout.tsx's own fallback, so the server render and the pre-
 * hydration client render agree — no hydration mismatch.
 */

const listeners = new Set<() => void>();

export function subscribeToAccentTheme(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getAccentThemeSnapshot(): string {
  return document.documentElement.dataset.accentTheme ?? "default_blue";
}

export function getAccentThemeServerSnapshot(): string {
  return "default_blue";
}

export function writeAccentTheme(value: string): void {
  document.documentElement.dataset.accentTheme = value;
  for (const listener of listeners) listener();
}
