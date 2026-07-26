import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Service-role ("secret key") Supabase client — bypasses RLS entirely. Per
 * docs/ARCHITECTURE.md §7, this is used ONLY for narrowly-scoped trusted
 * server-only operations (platform admin provisioning, scheduled jobs,
 * one-off dev/test data scripts run locally by a developer) — never from a
 * Route Handler or Server Function reachable by a regular user request, and
 * never imported into any file that can end up in a client bundle. The
 * `server-only` import guard enforces the latter at build time.
 *
 * Unlike lib/supabase/server.ts, this has no cookie-based session — every
 * request made with this client is unconditionally the service role, not
 * "whoever is currently logged in." Callers stay responsible for scoping
 * every query themselves (e.g. `.eq("organization_id", ...)`), the same
 * discipline RLS would otherwise provide.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "createAdminClient() requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY to be set.",
    );
  }

  return createSupabaseClient<Database>(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
