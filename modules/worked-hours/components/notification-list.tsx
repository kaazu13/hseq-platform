"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationRead } from "@/modules/worked-hours/actions";
import type { AppNotification } from "@/modules/worked-hours/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** Employee Dashboard's "Notifications / actions required" section — a simple, mark-as-read list. */
export function NotificationList({ notifications }: { notifications: AppNotification[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDismiss(id: string) {
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
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{notification.title}</span>
              {notification.body && <span className="text-sm text-muted-foreground">{notification.body}</span>}
            </div>
            {!notification.read_at && (
              <Button variant="ghost" size="sm" disabled={isPending} onClick={() => handleDismiss(notification.id)}>
                Mark read
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
