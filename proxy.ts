import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 file convention — the successor to `middleware.ts` (the
 * `middleware` file convention is deprecated and renamed to `proxy`; see
 * node_modules/next/dist/docs/.../file-conventions/proxy.md). Runs before
 * every matched request. All actual logic lives in
 * lib/supabase/middleware.ts so it stays testable independent of this
 * Next.js-specific wrapper — see docs/ARCHITECTURE.md §5.
 */
export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico and common static image extensions
     * Proxy would otherwise run (and needlessly hit Supabase) for every
     * asset request, per the "Good to know" note in the Next.js proxy docs.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
