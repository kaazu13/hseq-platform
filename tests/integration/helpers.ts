import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { setTestCookies } from "./setup";

/**
 * Local-only Supabase Auth helpers for the Server Action integration
 * suite. Fixture data (orgs/employees/memberships/projects/teams) reuses
 * tests/db/helpers.ts's raw-SQL builders directly — only the pieces that
 * genuinely need GoTrue (creating a real auth user, signing in for a real
 * session) live here.
 *
 * HARD SAFETY GUARD: same as tests/db/helpers.ts — refuses anything but a
 * loopback host. Never targets the remote/hosted project.
 */

const LOCAL_URL_DEFAULT = "http://127.0.0.1:54321";

function resolveUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_URL_DEFAULT;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL is not a valid URL: ${url}`);
  }
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error(
      `Refusing to run integration tests against host "${host}". ` +
        `tests/integration/** must only run against a disposable LOCAL Supabase instance ` +
        `(run "supabase start" first, and use the local URL/keys it prints).`,
    );
  }
  return url;
}

function requireLocalEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} must be set to your LOCAL Supabase instance's value (printed by "supabase start") ` +
        `to run integration tests — see .env.test.local.example.`,
    );
  }
  return value;
}

const SUPABASE_URL = resolveUrl();
const PUBLISHABLE_KEY = requireLocalEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const SECRET_KEY = requireLocalEnv("SUPABASE_SECRET_KEY");

const adminClient = createAdminClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Creates a real auth user via the Admin API (proper password hashing — unlike tests/db/helpers.ts's raw-SQL fixture, this user can actually sign in). */
export async function createIntegrationTestUser(email: string, password: string, fullName: string): Promise<string> {
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) throw error ?? new Error(`createUser failed for ${email}`);
  return data.user.id;
}

export async function deleteIntegrationTestUser(userId: string): Promise<void> {
  await adminClient.auth.admin.deleteUser(userId);
}

/**
 * Signs in as `email`/`password` and installs the resulting session into
 * the mocked cookies() (see setup.ts) — every Server Action call made
 * after this behaves exactly as it would for a real signed-in browser
 * request, because lib/supabase/server.ts's createClient() reads this
 * same cookie jar.
 */
export async function signInAs(email: string, password: string): Promise<void> {
  const cookies: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => [],
      setAll: (list) => {
        for (const c of list) cookies.push({ name: c.name, value: c.value });
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  setTestCookies(cookies);
}

export { clearTestCookies } from "./setup";
