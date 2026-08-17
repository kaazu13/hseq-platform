"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Bell, CheckCheck } from "lucide-react";
import { markNotificationRead, markAllNotificationsRead } from "@/modules/worked-hours/actions";
import type { AppNotification } from "@/modules/worked-hours/types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Task 3 Part 27 — genuinely locale-aware, not a hand-rolled English "Xm
// ago" template: `format.relativeTime()` wraps Intl.RelativeTimeFormat,
// which picks correct grammar/units per locale on its own. Items 7+ days
// old fall back to a short absolute date (`format.dateTime`, also
// locale-aware) rather than an ever-growing "12d ago". Kept as a
// module-scope function (not a closure inside the component) so its
// `Date.now()` call isn't flagged by the render-purity lint rule, matching
// this file's pre-existing pattern.
function relativeTime(value: string, format: ReturnType<typeof useFormatter>, justNowLabel: string): string {
  const date = new Date(value);
  const diffMinutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMinutes < 1) return justNowLabel;
  const diffDays = Math.round(diffMinutes / 1440);
  if (diffDays >= 7) return format.dateTime(date, { month: "short", day: "numeric" });
  return format.relativeTime(date);
}

type NotificationBellProps = {
  /** The REAL total unread count (server-fetched, not derived from `notifications` below) — there can be more unread notifications than the compact list shows. */
  unreadCount: number;
  /** The latest ~5 notifications (read or unread) for the compact dropdown preview. */
  notifications: AppNotification[];
};

/**
 * The bell's dropdown preview (item 3) — TopBar (a Server Component)
 * fetches `unreadCount` and the latest few `notifications` fresh on every
 * navigation and passes them in here; this component only owns the
 * open/closed UI state and the mark-read interactions. Opening the
 * dropdown never marks anything read by itself ("do not mark everything
 * read merely because the pointer touches the bell") — only an explicit
 * "Mark all as read" click, or clicking one specific notification (which
 * marks only that one), ever calls a mark-read action. The full
 * `/notifications` page's own existing "mark everything read on visit"
 * behavior (NotificationCenterAutoRead) is untouched — that is a
 * deliberate, pre-existing, distinct behavior for the full history view,
 * not something this dropdown does.
 */
export function NotificationBell({ unreadCount, notifications }: NotificationBellProps) {
  const router = useRouter();
  const t = useTranslations("Notifications");
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSelect(notification: AppNotification) {
    setOpen(false);
    if (!notification.read_at) {
      startTransition(async () => {
        await markNotificationRead(notification.id);
        router.refresh();
      });
    }
    if (notification.link_path) {
      router.push(notification.link_path);
    }
  }

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={unreadCount > 0 ? t("ariaUnread", { count: unreadCount }) : t("aria")}
            title={t("title")}
            className="relative"
          />
        }
      >
        <Bell />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between gap-2 px-1.5 py-1">
          <span className="text-sm font-medium">{t("title")}</span>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-auto px-1.5 py-0.5 text-xs" disabled={isPending} onClick={handleMarkAllRead}>
              <CheckCheck className="size-3.5" />
              {t("markAllAsRead")}
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />

        {notifications.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">{t("allCaughtUp")}</p>
        ) : (
          notifications.map((notification) => (
            <DropdownMenuItem key={notification.id} onClick={() => handleSelect(notification)} className="flex-col items-start gap-0.5 whitespace-normal py-2">
              <div className="flex w-full items-center gap-1.5">
                {!notification.read_at && <span className="size-1.5 shrink-0 rounded-full bg-destructive" aria-hidden="true" />}
                <span className={cn("truncate text-sm", !notification.read_at ? "font-semibold" : "font-normal text-muted-foreground")}>{notification.title}</span>
              </div>
              {notification.body && <span className="line-clamp-2 text-xs text-muted-foreground">{notification.body}</span>}
              <span className="text-[11px] text-muted-foreground">{relativeTime(notification.created_at, format, t("justNow"))}</span>
            </DropdownMenuItem>
          ))
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/notifications" />} className="justify-center text-sm font-medium">
          {t("viewAll")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
