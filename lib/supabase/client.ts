import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components.
 *
 * Uses only the publishable (anon-equivalent) key — safe to expose to the
 * browser, since Row Level Security (not key secrecy) is what protects data.
 * See docs/ARCHITECTURE.md §7 (Secrets and Environment Variables).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
