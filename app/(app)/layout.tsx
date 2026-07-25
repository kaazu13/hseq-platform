import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/session";
import { logout } from "@/modules/auth/actions";

/**
 * Shared shell for every authenticated ("tenant-scoped app shell") route —
 * see docs/ARCHITECTURE.md §4. `requireUser()` is the defense-in-depth
 * check described in §5: proxy.ts already redirected unauthenticated
 * requests to /login before this ever renders, but this layout re-verifies
 * independently so a proxy matcher gap can't silently expose the route.
 *
 * Only a minimal top bar (per docs/UI_GUIDELINES.md §4 — "persistent top
 * bar") is included: the signed-in user's email and a logout button.
 * Active-organization context and role-aware navigation described in the
 * same section are deferred until the organization/role schema exists.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireUser();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-current/10 px-4 py-3">
        <span className="font-medium">HSEQ Platform</span>
        <div className="flex items-center gap-4 text-sm">
          <span className="opacity-70">{user.email}</span>
          <form action={logout}>
            <button type="submit" className="underline underline-offset-4">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
