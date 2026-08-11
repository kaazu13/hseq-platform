import { Bell } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { listMyNotifications } from "@/modules/worked-hours/queries";
import { NotificationList } from "@/modules/worked-hours/components/notification-list";
import { MarkAllNotificationsReadButton } from "@/modules/worked-hours/components/mark-all-notifications-read-button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

/**
 * Notification Center (Phase 6) — every notification belonging to the
 * signed-in user, unread first. Recipient-scoped entirely server-side
 * (listMyNotifications()/RLS both key off `recipient_user_id = auth.uid()`)
 * — there is no id/param a caller could manipulate to reach anyone else's
 * notifications, since none is ever accepted from the client.
 */
export default async function NotificationsPage() {
  await requireUser();
  const notifications = await listMyNotifications(100);
  const unreadCount = notifications.filter((notification) => !notification.read_at).length;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Notifications"
        description={unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up."}
        actions={<MarkAllNotificationsReadButton disabled={unreadCount === 0} />}
      />

      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications yet" description="Updates about your worked hours and other account activity will appear here." className="flex-1" />
      ) : (
        <NotificationList notifications={notifications} />
      )}
    </div>
  );
}
