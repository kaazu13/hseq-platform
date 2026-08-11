import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { getUnreadNotificationCount } from "@/modules/worked-hours/queries";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Breadcrumbs } from "@/components/app-shell/breadcrumbs";

/**
 * Persistent top bar — see docs/UI_GUIDELINES.md §4. Global search remains
 * a UI placeholder only (out of this milestone's scope); the notifications
 * bell is now real (Phase 6) — a Server Component so the unread count is
 * fetched fresh on every navigation, same "no client-only parallel state"
 * principle as the rest of this milestone.
 */
export async function TopBar() {
  const unreadCount = await getUnreadNotificationCount();

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
        <Button
          variant="ghost"
          size="icon"
          nativeButton={false}
          render={<Link href="/notifications" />}
          aria-label={unreadCount > 0 ? `Notifications — ${unreadCount} unread` : "Notifications"}
          title="Notifications"
          className="relative"
        >
          <Bell />
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </div>
    </header>
  );
}
