"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { NAV_GROUPS, isNavItemActive } from "@/components/app-shell/nav-config";
import { parseCollapsedGroups, serializeCollapsedGroups, isGroupOpen } from "@/components/app-shell/nav-state";
import { subscribeToCollapsedGroups, getCollapsedGroupsSnapshot, getCollapsedGroupsServerSnapshot, writeCollapsedGroups } from "@/components/app-shell/nav-storage";
import type { RoleName } from "@/modules/companies/types";
import { cn } from "@/lib/utils";

/**
 * The primary nav menu — collapsible topic groups, filtered by the
 * caller's roles (a UI convenience only; every destination page still
 * enforces its own server-side check independently, per
 * docs/ARCHITECTURE.md §6 — hiding a link here is never the security
 * boundary). The group containing the active route is always force-open
 * regardless of stored preference; every other group's collapsed state is
 * remembered per-browser via localStorage (never anything sensitive — just
 * which labels are collapsed).
 */
export function NavMain({ roleNames }: { roleNames: RoleName[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isMobile, setOpenMobile } = useSidebar();

  // Server render and the pre-hydration client render both see the empty
  // snapshot (all-expanded) — no hydration mismatch — then React re-renders
  // once with the real persisted preference after mount. A one-frame
  // "everything expanded" flash is an acceptable, standard tradeoff for a
  // client-only preference.
  const storedValue = useSyncExternalStore(subscribeToCollapsedGroups, getCollapsedGroupsSnapshot, getCollapsedGroupsServerSnapshot);
  const collapsed = useMemo(() => parseCollapsedGroups(storedValue || null), [storedValue]);

  const visibleGroups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.roles || item.roles.some((role) => roleNames.includes(role))),
      })).filter((group) => group.items.length > 0),
    [roleNames],
  );

  const activeGroupLabel = useMemo(
    () => visibleGroups.find((group) => group.items.some((item) => isNavItemActive(item, pathname, searchParams)))?.label,
    [visibleGroups, pathname, searchParams],
  );

  function toggleGroup(label: string, open: boolean) {
    const next = new Set(collapsed);
    if (open) next.delete(label);
    else next.add(label);
    writeCollapsedGroups(serializeCollapsedGroups(next));
  }

  function handleNavigate() {
    // Mobile sidebar is a Sheet-based drawer that otherwise stays open
    // after a link click — close it so the destination page is visible.
    if (isMobile) setOpenMobile(false);
  }

  return (
    <>
      {visibleGroups.map((group) => {
        const isGroupActive = group.label === activeGroupLabel;
        const isOpen = isGroupOpen(group.label, isGroupActive, collapsed);
        const panelId = `nav-group-${group.label.toLowerCase().replace(/\s+/g, "-")}`;

        return (
          <Collapsible key={group.label} open={isOpen} onOpenChange={(open) => toggleGroup(group.label, open)}>
            <SidebarGroup>
              <CollapsibleTrigger
                aria-controls={panelId}
                className={cn(
                  "flex h-8 w-full shrink-0 items-center justify-between gap-1 rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-hidden transition-colors duration-200 ease-linear hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:hidden",
                  isGroupActive && "text-sidebar-foreground",
                )}
              >
                <span className="truncate">{group.label}</span>
                <ChevronRight className={cn("size-3.5 shrink-0 transition-transform duration-150", isOpen && "rotate-90")} aria-hidden="true" />
              </CollapsibleTrigger>

              <CollapsiblePanel id={panelId}>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => {
                      const isActive = isNavItemActive(item, pathname, searchParams);
                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton
                            isActive={isActive}
                            tooltip={item.label}
                            render={<Link href={item.href} onClick={handleNavigate} />}
                          >
                            <item.icon />
                            <span>{item.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsiblePanel>
            </SidebarGroup>
          </Collapsible>
        );
      })}
    </>
  );
}
