import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany, getCurrentUserProfile } from "@/modules/companies/queries";
import { resolveCurrentProject } from "@/modules/projects/queries";
import { isCurrentUserPlatformSuperAdmin } from "@/modules/platform-admin/queries";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { TopBar } from "@/components/app-shell/top-bar";

/**
 * Shared shell for every authenticated ("tenant-scoped app shell") route —
 * see docs/ARCHITECTURE.md §4. `requireUser()` is the defense-in-depth
 * check described in §5: proxy.ts already redirected unauthenticated
 * requests to /login before this ever renders, but this layout re-verifies
 * independently so a proxy matcher gap can't silently expose the route.
 *
 * "Current company" resolution is shared with every employees page via
 * `resolveCurrentCompany()` (modules/companies/queries.ts) — see
 * that function's own comment for the exact resolution order. Purely a
 * display/UX concern; no authorization decision anywhere reads it — see
 * docs/ARCHITECTURE.md §3.2.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireUser();

  const [{ companies, currentCompanyId }, profile, cookieStore, locale] = await Promise.all([
    resolveCurrentCompany(user.id),
    getCurrentUserProfile(user.id),
    cookies(),
    getLocale(),
  ]);
  const [companyRoleNames, { projects, currentProjectId }, isPlatformSuperAdmin] = await Promise.all([
    currentCompanyId ? getUserRoleNames(currentCompanyId) : Promise.resolve([]),
    currentCompanyId ? resolveCurrentProject(user.id, currentCompanyId) : Promise.resolve({ projects: [], currentProjectId: null }),
    isCurrentUserPlatformSuperAdmin(),
  ]);
  // platform_super_admin is a global grant (platform_super_admins table),
  // never a company_memberships/membership_roles row — appending it here
  // (rather than threading a second prop through AppSidebar/NavMain) lets
  // nav-config.ts's existing `roles` filter mechanism gate the
  // /platform-admin link with zero changes to that filter itself, and
  // correctly still shows it even when the caller has NO company
  // membership at all (currentCompanyId null) — the case a brand-new
  // platform admin creating their very first company is actually in.
  const roleNames = isPlatformSuperAdmin ? [...companyRoleNames, "platform_super_admin" as const] : companyRoleNames;

  const sidebarOpenCookie = cookieStore.get("sidebar_state")?.value;
  const defaultSidebarOpen = sidebarOpenCookie !== "false";

  const displayName = profile?.full_name?.trim() || user.email?.split("@")[0] || "";
  const currentProjectTimezone = projects.find((project) => project.id === currentProjectId)?.timezone ?? null;

  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen}>
      <AppSidebar
        companies={companies}
        currentCompanyId={currentCompanyId}
        projects={projects}
        currentProjectId={currentProjectId}
        roleNames={roleNames}
      />
      <SidebarInset>
        <TopBar projectTimezone={currentProjectTimezone} user={{ name: displayName, email: user.email ?? "" }} locale={locale} />
        <main className="flex flex-1 flex-col">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
