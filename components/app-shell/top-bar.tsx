import { Bell, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Breadcrumbs } from "@/components/app-shell/breadcrumbs";

/**
 * Persistent top bar — see docs/UI_GUIDELINES.md §4. Global search and
 * notifications are UI placeholders only per this milestone's scope (item
 * 8): present, visibly non-functional, not wired to any data or route.
 */
export function TopBar() {
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
          disabled
          aria-label="Notifications (coming soon)"
          title="Notifications — coming soon"
        >
          <Bell />
        </Button>
      </div>
    </header>
  );
}
