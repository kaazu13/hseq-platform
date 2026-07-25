import "server-only";
import { unauthorized } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Reusable server-side auth utilities (docs/ARCHITECTURE.md §4, "lib/auth/
 * session.ts — getSession(), requireUser(), requireRole()").
 *
 * SCOPE NOTE (M1/M3 foundation milestone): these utilities resolve the raw
 * Supabase Auth user only. docs/ARCHITECTURE.md §5 describes requireUser()
 * as also resolving the caller's validated *active organization* and
 * role(s) — that requires the organization_memberships / membership_roles
 * schema and current_org_id()/current_role_ids() RLS helpers from
 * docs/DATABASE_SCHEMA.md §3 & §8, plus the Custom Access Token Auth Hook
 * from docs/ARCHITECTURE.md §3.2, none of which exist in this Supabase
 * project yet (see the implementation report for details). requireRole()
 * is intentionally NOT implemented here — a stub would either be a no-op
 * (unsafe to leave lying around) or fabricate a role model the docs don't
 * describe. It is added when that schema lands, per
 * docs/IMPLEMENTATION_PLAN.md M5.
 */

/** Returns the signed-in user, or null if there isn't one. Never redirects. */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Returns the signed-in user, or calls `unauthorized()` (renders
 * app/unauthorized.tsx, HTTP 401) if there isn't one. Use at the top of any
 * Server Component, Server Function, or Route Handler that requires a
 * session — see docs/API_CONVENTIONS.md §3, step 1.
 */
export async function requireUser(): Promise<{ user: User }> {
  const user = await getCurrentUser();

  if (!user) {
    unauthorized();
  }

  return { user };
}
