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
import { CompanySwitcher } from "@/components/app-shell/company-switcher";
import { ProjectSwitcher } from "@/components/app-shell/project-switcher";
import { NavMain } from "@/components/app-shell/nav-main";
import { UserMenu } from "@/components/app-shell/user-menu";
import type { CompanySummary, RoleName } from "@/modules/companies/types";
import type { Project } from "@/modules/projects/types";

type AppSidebarProps = {
  companies: CompanySummary[];
  currentCompanyId: string | null;
  projects: Project[];
  currentProjectId: string | null;
  user: { name: string; email: string };
  roleNames: RoleName[];
};

/**
 * The desktop-collapsible / mobile-drawer sidebar — built on shadcn's
 * `Sidebar` primitive (components/ui/sidebar.tsx), which already handles
 * the collapse-to-icons desktop behavior, the Sheet-based mobile drawer,
 * and persisting collapsed state in a cookie. This component only supplies
 * the content: brand mark + company switcher in the header, the nav menu in
 * the content area, and the user menu in the footer. A Server Component —
 * everything interactive (company switching, the user menu, active nav state)
 * is pushed down into the small client components it renders.
 */
export function AppSidebar({ companies, currentCompanyId, projects, currentProjectId, user, roleNames }: AppSidebarProps) {
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
        <CompanySwitcher companies={companies} currentCompanyId={currentCompanyId} />
        {currentCompanyId && (
          <ProjectSwitcher companyId={currentCompanyId} projects={projects} currentProjectId={currentProjectId} />
        )}
      </SidebarHeader>

      <SidebarContent>
        <NavMain roleNames={roleNames} />
      </SidebarContent>

      <SidebarFooter>
        <UserMenu name={user.name} email={user.email} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
