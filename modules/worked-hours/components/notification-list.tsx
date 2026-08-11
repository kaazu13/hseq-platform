"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationRead } from "@/modules/worked-hours/actions";
import type { AppNotification } from "@/modules/worked-hours/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function formatNotificationTimestamp(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Notification list — shared by the Employee Dashboard's compact
 * "Notifications" section and the full /notifications Notification Center
 * page (Phase 6); `compact` trims the timestamp/type row for the dashboard's
 * tighter space. Every notification here already belongs to the caller —
 * RLS (recipient_user_id = auth.uid()) scoped both listMyNotifications() and
 * markNotificationRead() itself, so there is no client-side ownership check
 * to get wrong.
 */
export function NotificationList({ notifications, compact = false }: { notifications: AppNotification[]; compact?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleMarkRead(id: string) {
    startTransition(async () => {
      await markNotificationRead(id);
      router.refresh();
    });
  }

  if (notifications.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {notifications.map((notification) => (
        <Card key={notification.id} className={notification.read_at ? "opacity-60" : undefined}>
          <CardContent className="flex flex-wrap items-start justify-between gap-2 pt-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium">{notification.title}</span>
              {notification.body && <span className="text-sm text-muted-foreground">{notification.body}</span>}
              {!compact && <span className="text-xs text-muted-foreground">{formatNotificationTimestamp(notification.created_at)}</span>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {notification.link_path && (
                <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={notification.link_path} />}>
                  View
                </Button>
              )}
              {!notification.read_at && (
                <Button variant="ghost" size="sm" disabled={isPending} onClick={() => handleMarkRead(notification.id)}>
                  Mark read
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
