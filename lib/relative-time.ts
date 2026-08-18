import type { useFormatter } from "next-intl";

/**
 * Task 3 closure — extracted out of components/app-shell/notification-bell.tsx
 * into its own plain module (this codebase's established pattern for
 * testable pure logic — see lib/project-date.ts, lib/phone.ts,
 * lib/greetings.ts) specifically so it can be unit-tested without pulling
 * in the component's own "use client" + Server Function import graph.
 *
 * `now` is REQUIRED, never optional/implicit — this is the direct fix for
 * next-intl's ENVIRONMENT_FALLBACK warning: format.relativeTime() needs an
 * explicit reference point, since silently reading the ambient clock
 * (Date.now()) differs between the server render and client hydration
 * passes. Callers get `now` from next-intl's useNow() hook (which itself
 * starts from the request-time snapshot the root layout passes to
 * NextIntlClientProvider's `now` prop, then updates on a lightweight
 * client-side interval — see notification-bell.tsx).
 */
export function relativeTime(value: string, format: ReturnType<typeof useFormatter>, now: Date, justNowLabel: string): string {
  const date = new Date(value);
  const diffMinutes = Math.round((now.getTime() - date.getTime()) / 60000);
  if (diffMinutes < 1) return justNowLabel;
  const diffDays = Math.round(diffMinutes / 1440);
  if (diffDays >= 7) return format.dateTime(date, { month: "short", day: "numeric" });
  return format.relativeTime(date, now);
}
