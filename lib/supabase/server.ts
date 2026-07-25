import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

/**
 * Supabase client for use in Server Components, Server Functions, and Route
 * Handlers. Must be created fresh per request — never cached/shared across
 * requests (see @supabase/ssr's own guidance).
 *
 * `cookies()` is async in this Next.js version, so this factory is async too.
 *
 * Writing cookies (`setAll`) is not supported while a Server Component is
 * rendering — only from a Server Function or Route Handler. The try/catch
 * below swallows that specific failure because `proxy.ts` (via
 * lib/supabase/middleware.ts) already refreshes the session on every
 * navigation; a Server Component that only *reads* the session doesn't need
 * `setAll` to succeed. See docs/ARCHITECTURE.md §5.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component during rendering — safe to
            // ignore because proxy.ts refreshes the session on navigation.
          }
        },
      },
    },
  );
}
