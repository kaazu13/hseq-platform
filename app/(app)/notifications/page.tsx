import { Bell } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { listMyNotifications } from "@/modules/worked-hours/queries";
import { NotificationList } from "@/modules/worked-hours/components/notification-list";
import { MarkAllNotificationsReadButton } from "@/modules/worked-hours/components/mark-all-notifications-read-button";
import { NotificationCenterAutoRead } from "@/modules/worked-hours/components/notification-center-auto-read";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { RefreshButton } from "@/components/shared/refresh-button";
import { AutoRefresh } from "@/components/shared/auto-refresh";

/**
 * Notification Center — every notification belonging to the signed-in
 * user, unread first. Recipient-scoped entirely server-side
 * (listMyNotifications()/RLS both key off `recipient_user_id = auth.uid()`)
 * — there is no id/param a caller could manipulate to reach anyone else's
 * notifications, since none is ever accepted from the client.
 *
 * Item 3: viewing this page marks the currently-displayed notifications
 * read (NotificationCenterAutoRead) — the unread badge in the top bar
 * reflects that on the NEXT render (a real server re-fetch via
 * router.refresh(), not client-side optimistic state), never lingering
 * after the notifications have genuinely been shown. The "Mark all as
 * read" button remains for a user who wants to clear the badge without
 * opening the full list (e.g. from a place that only shows the count).
 */
export default async function NotificationsPage() {
  await requireUser();
  const notifications = await listMyNotifications(100);
  const unreadCount = notifications.filter((notification) => !notification.read_at).length;

  return (
    <NotificationCenterAutoRead hasUnread={unreadCount > 0}>
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <AutoRefresh intervalMs={45000} />
        <PageHeader
          title="Notifications"
          description={unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up."}
          actions={
            <>
              <RefreshButton />
              <MarkAllNotificationsReadButton disabled={unreadCount === 0} />
            </>
          }
        />

        {notifications.length === 0 ? (
          <EmptyState icon={Bell} title="No notifications yet" description="Updates about your worked hours and other account activity will appear here." className="flex-1" />
        ) : (
          <NotificationList notifications={notifications} />
        )}
      </div>
    </NotificationCenterAutoRead>
  );
}
