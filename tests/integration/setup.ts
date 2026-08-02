import { vi } from "vitest";

/**
 * Minimal Next.js platform-context shim for calling real Server Actions
 * (each domain module's actions.ts) from plain Node/Vitest. Server Actions are just
 * async functions, but two of them depend on Next.js request-scoped APIs
 * that don't exist outside a real request:
 *
 *   - `next/headers`'s `cookies()` — used by lib/supabase/server.ts's
 *     createClient() to read the session cookie. Stubbed with an
 *     in-memory jar set per-test via setTestCookies() (tests/integration/
 *     helpers.ts), populated with a REAL Supabase session obtained by
 *     actually signing in against local Supabase — the session itself is
 *     real, only the cookie-transport mechanism is stubbed.
 *   - `next/navigation`'s `forbidden()`/`unauthorized()`/`redirect()`/
 *     `notFound()` — normally throw a special Next-internal "digest" error
 *     caught by the framework's error boundary. Outside a real request
 *     there is no boundary, so these throw a plain, assertable Error
 *     instead — tests assert on the message, the same signal
 *     app/forbidden.tsx etc. key off of in the real app.
 *   - `next/cache`'s `revalidatePath` — no-op; there is no real cache to
 *     revalidate outside a request.
 *
 * This is intentionally the full extent of the shim — three small,
 * targeted mocks, not a general Next.js runtime. Every actual behavior
 * under test (auth checks, Supabase calls, RLS enforcement, validation)
 * still runs for real against local Supabase.
 */

let currentCookies: { name: string; value: string }[] = [];

export function setTestCookies(cookies: { name: string; value: string }[]) {
  currentCookies = cookies;
}

export function clearTestCookies() {
  currentCookies = [];
}

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => currentCookies,
    set: () => {},
  }),
}));

vi.mock("next/navigation", () => ({
  forbidden: () => {
    throw new Error("NEXT_FORBIDDEN");
  },
  unauthorized: () => {
    throw new Error("NEXT_UNAUTHORIZED");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));
