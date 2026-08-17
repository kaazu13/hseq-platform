import { getUnreadNotificationCount, listMyNotifications } from "@/modules/worked-hours/queries";
import { NotificationBell } from "@/components/app-shell/notification-bell";
import { ProjectClock } from "@/components/app-shell/project-clock";
import { UserMenu } from "@/components/app-shell/user-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Breadcrumbs } from "@/components/app-shell/breadcrumbs";

const NOTIFICATION_PREVIEW_LIMIT = 5;

type TopBarProps = {
  /** The current project's timezone (Task 3 Part 11) — resolved once by the layout (which already fetches the project list/current selection for the sidebar switcher) and passed down, rather than re-querying here. */
  projectTimezone: string | null;
  /** Task 3 Part 16 — the profile menu now lives here, top-right. */
  user: { name: string; email: string };
  /** Task 3 Part 22 — the caller's resolved next-intl locale, passed down for UserMenu's quick language-switch submenu. */
  locale: string;
};

/**
 * Persistent top bar — see docs/UI_GUIDELINES.md §4. Task 3 Part 10: the
 * disabled "Search — coming soon" placeholder is removed outright (it was
 * never functional and had been sitting there since an earlier milestone
 * with no real search behind it) — nothing replaces it, this is a genuine
 * removal, not a swap. The notifications bell is a real compact dropdown
 * (item 3) — a Server Component so the unread count and preview list are
 * fetched fresh on every navigation, same "no client-only parallel state"
 * principle as the rest of this milestone. The bell is the primary
 * notification UX — the dashboard's own Notifications card was removed
 * (item 2) since it duplicated this.
 */
export async function TopBar({ projectTimezone, user, locale }: TopBarProps) {
  const [unreadCount, notifications] = await Promise.all([getUnreadNotificationCount(), listMyNotifications(NOTIFICATION_PREVIEW_LIMIT)]);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 print:hidden">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumbs />

      <div className="ml-auto flex items-center gap-3">
        <ProjectClock timezone={projectTimezone} />
        <NotificationBell unreadCount={unreadCount} notifications={notifications} />
        <Separator orientation="vertical" className="h-6" />
        <UserMenu name={user.name} email={user.email} locale={locale} />
      </div>
    </header>
  );
}
