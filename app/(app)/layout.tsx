import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentOrganization, getCurrentUserProfile } from "@/modules/organizations/queries";
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
 * "Current organization" resolution is shared with every employees page via
 * `resolveCurrentOrganization()` (modules/organizations/queries.ts) — see
 * that function's own comment for the exact resolution order. Purely a
 * display/UX concern; no authorization decision anywhere reads it — see
 * docs/ARCHITECTURE.md §3.2.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireUser();

  const [{ organizations, currentOrganizationId }, profile, cookieStore] = await Promise.all([
    resolveCurrentOrganization(user.id),
    getCurrentUserProfile(user.id),
    cookies(),
  ]);
  const roleNames = currentOrganizationId ? await getUserRoleNames(currentOrganizationId) : [];

  const sidebarOpenCookie = cookieStore.get("sidebar_state")?.value;
  const defaultSidebarOpen = sidebarOpenCookie !== "false";

  const displayName = profile?.full_name?.trim() || user.email?.split("@")[0] || "";

  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen}>
      <AppSidebar
        organizations={organizations}
        currentOrganizationId={currentOrganizationId}
        user={{ name: displayName, email: user.email ?? "" }}
        roleNames={roleNames}
      />
      <SidebarInset>
        <TopBar />
        <main className="flex flex-1 flex-col">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
