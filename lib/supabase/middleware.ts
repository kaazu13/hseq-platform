import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Shared session-refresh + route-gating logic, called from the project's
 * proxy.ts (Next.js 16's replacement for middleware.ts — see
 * docs/ARCHITECTURE.md §1). Kept in lib/supabase/ rather than inline in
 * proxy.ts because this is the standard Supabase SSR pattern and it lets the
 * cookie-bridging logic be unit-testable independent of the Next.js file
 * convention wrapper.
 *
 * Responsibilities (and ONLY these — see docs/ARCHITECTURE.md §5):
 *  1. Refresh the Supabase session cookie on every navigation.
 *  2. Redirect unauthenticated users away from protected routes.
 *
 * This is a coarse, last-resort gate. It is not the only authorization
 * check — every Server Function and Route Handler re-verifies the session
 * itself via requireUser() (lib/auth/session.ts), since a matcher
 * misconfiguration here must not silently skip authorization elsewhere.
 */

// Public routes reachable without a session. Deny-by-default: everything
// NOT in this list is treated as protected, so a newly added (app) route
// is protected automatically without this list needing to be updated.
// "/share" is the external report-sharing read-only route
// (app/share/[token]/**) — deliberately public; its own authorization is
// entirely the token itself (resolve_public_report()), never company/
// project membership — see supabase/migrations/20260817090000_report_pdf_export_and_sharing.sql's
// header comment.
const PUBLIC_PATHS = ["/login", "/unauthorized", "/forbidden", "/share"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() (not getSession()) — it revalidates the JWT against the Auth
  // server rather than trusting the possibly-stale cookie contents.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
