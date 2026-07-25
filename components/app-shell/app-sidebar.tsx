import Link from "next/link";
import { HardHat } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { OrgSwitcher } from "@/components/app-shell/org-switcher";
import { NavMain } from "@/components/app-shell/nav-main";
import { UserMenu } from "@/components/app-shell/user-menu";
import type { OrganizationSummary } from "@/modules/organizations/types";

type AppSidebarProps = {
  organizations: OrganizationSummary[];
  currentOrganizationId: string | null;
  user: { name: string; email: string };
};

/**
 * The desktop-collapsible / mobile-drawer sidebar — built on shadcn's
 * `Sidebar` primitive (components/ui/sidebar.tsx), which already handles
 * the collapse-to-icons desktop behavior, the Sheet-based mobile drawer,
 * and persisting collapsed state in a cookie. This component only supplies
 * the content: brand mark + org switcher in the header, the nav menu in
 * the content area, and the user menu in the footer. A Server Component —
 * everything interactive (org switching, the user menu, active nav state)
 * is pushed down into the small client components it renders.
 */
export function AppSidebar({ organizations, currentOrganizationId, user }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold"
        >
          <HardHat className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate group-data-[collapsible=icon]:hidden">HSEQ Platform</span>
        </Link>
        <SidebarSeparator className="mx-0" />
        <OrgSwitcher organizations={organizations} currentOrganizationId={currentOrganizationId} />
      </SidebarHeader>

      <SidebarContent>
        <NavMain />
      </SidebarContent>

      <SidebarFooter>
        <UserMenu name={user.name} email={user.email} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
