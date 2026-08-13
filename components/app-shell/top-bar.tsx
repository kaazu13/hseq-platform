import { Search } from "lucide-react";
import { getUnreadNotificationCount, listMyNotifications } from "@/modules/worked-hours/queries";
import { NotificationBell } from "@/components/app-shell/notification-bell";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Breadcrumbs } from "@/components/app-shell/breadcrumbs";

const NOTIFICATION_PREVIEW_LIMIT = 5;

/**
 * Persistent top bar — see docs/UI_GUIDELINES.md §4. Global search remains
 * a UI placeholder only (out of this milestone's scope); the notifications
 * bell is a real compact dropdown (item 3) — a Server Component so the
 * unread count and preview list are fetched fresh on every navigation,
 * same "no client-only parallel state" principle as the rest of this
 * milestone. The bell is now the primary notification UX — the dashboard's
 * own Notifications card was removed (item 2) since it duplicated this.
 */
export async function TopBar() {
  const [unreadCount, notifications] = await Promise.all([getUnreadNotificationCount(), listMyNotifications(NOTIFICATION_PREVIEW_LIMIT)]);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 print:hidden">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumbs />

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled
          className="hidden text-muted-foreground sm:inline-flex"
          title="Global search — coming soon"
        >
          <Search />
          Search
          <kbd className="ml-2 rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </Button>
        <NotificationBell unreadCount={unreadCount} notifications={notifications} />
      </div>
    </header>
  );
}
