"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type AutoRefreshProps = {
  /** How often to re-fetch while the tab is visible. Keep this generous — this is a background "someone else may have changed something" nudge, not a correctness mechanism (RULE 1's post-mutation revalidatePath already covers the current user's own changes instantly). */
  intervalMs?: number;
};

/**
 * Part 6 (Data Freshness), RULE 2: lightweight polling for the small set of
 * screens where near-live visibility of ANOTHER user's changes genuinely
 * matters (Today's Teams, Notifications) — deliberately NOT Supabase
 * Realtime. No Realtime channel/subscription exists anywhere in this
 * codebase yet; adding one here would mean introducing new infrastructure
 * (connection lifecycle, RLS-aware realtime policies, reconnect/backoff
 * handling) for a handful of screens where a plain interval + the existing
 * Server Component data-fetching path is simpler, cheaper, and just as
 * reliable — see docs/API_CONVENTIONS.md-style reasoning: prefer the
 * simplest option that actually satisfies the requirement.
 *
 * Only ONE interval is ever active per mounted instance (guarded by the
 * effect's own cleanup — a re-render never stacks a second timer), it is
 * cleared on unmount/navigation (no leaked timers across route changes),
 * and it pauses entirely while the tab is hidden (`visibilitychange`) so a
 * backgrounded tab never generates load or reappears with a stale flash.
 * `router.refresh()` re-runs the current Server Component tree in place —
 * same mechanism RefreshButton uses — so this is purely "do that
 * automatically every N seconds," nothing more.
 */
export function AutoRefresh({ intervalMs = 60000 }: AutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (timer !== null) return;
      timer = setInterval(() => router.refresh(), intervalMs);
    }

    function stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") start();
      else stop();
    }

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [intervalMs, router]);

  return null;
}
