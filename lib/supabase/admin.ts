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
 * every query themselves (e.g. `.eq("company_id", ...)`), the same
 * discipline RLS would otherwise provide.
 *
 * ONE deliberate, reviewed exception to "never from a path reachable by a
 * regular/anonymous request": app/share/[token]/pdf/route.tsx (Toolbox
 * Meeting/Safety Flash passthrough branch only). That route independently
 * re-validates the share token via the anon-safe resolve_public_report()
 * RPC FIRST — the exact same authorization boundary every other public
 * share type already relies on — and only after that succeeds uses this
 * client to mint a single short-lived (60s) signed URL for the ONE,
 * server-resolved (never client-supplied) object path. This replaced a
 * standing anon Storage RLS grant that allowed enumerating every
 * currently-shared document platform-wide via the raw Storage API — see
 * supabase/migrations/20260819090000_fix_share_storage_enumeration.sql's
 * header comment for the full incident/reasoning. Do not add a second
 * "convenient" usage site without the same independent-authorization-first
 * property this one has.
 *
 * NOT used for Platform Admin session revocation: @supabase/auth-js's
 * `auth.admin.signOut()` takes the TARGET USER'S OWN JWT as its argument,
 * not a user id — an admin cannot legitimately obtain that, so this
 * client offers no real "revoke this user's session by id" capability.
 * See modules/platform-admin/actions.ts's revokeUserSessions() for the
 * disclosed limitation and the actual (application-level, not token-
 * level) enforcement this codebase relies on instead.
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
