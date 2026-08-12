"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { markAllNotificationsRead } from "@/modules/worked-hours/actions";

/**
 * Item 3: marks the currently-displayed notifications read ONLY after
 * they have genuinely rendered — a `useEffect` fires after mount, which
 * by definition happens after the already-server-fetched list has
 * successfully loaded and painted, never on a bare pointer-down before
 * that. `router.refresh()` afterward re-runs the Server Component chain
 * (including TopBar's own fresh `getUnreadNotificationCount()` read), so
 * the bell badge disappears exactly when the count genuinely reaches
 * zero — not a moment earlier, not via any client-side optimistic state.
 */
export function NotificationCenterAutoRead({ hasUnread, children }: { hasUnread: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const marked = useRef(false);

  useEffect(() => {
    if (!hasUnread || marked.current) return;
    marked.current = true;
    markAllNotificationsRead().then(() => router.refresh());
  }, [hasUnread, router]);

  return <>{children}</>;
}
