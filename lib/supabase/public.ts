import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Anonymous (no session, no cookies) Supabase client — every query made
 * with this client runs as the `anon` Postgres role. Used ONLY by the
 * public share resolution path (app/share/[token]/**), which by design
 * has no authenticated user at all. Distinct from lib/supabase/admin.ts's
 * service-role client (which docs/ARCHITECTURE.md §7 forbids using from
 * any request path reachable by a regular/anonymous request) — this client
 * has NO elevated privileges whatsoever; every capability it has is an
 * ordinary `anon`-role grant/RLS policy, auditable the same way any other
 * role's access is (see the migration's header comment).
 */
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("createPublicClient() requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to be set.");
  }

  return createSupabaseClient<Database>(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
