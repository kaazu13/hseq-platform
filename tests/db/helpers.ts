import postgres from "postgres";
import { randomUUID } from "node:crypto";

/**
 * Shared fixture/impersonation helpers for the database/RLS test suite
 * (tests/db/**). Connects DIRECTLY to Postgres (bypassing PostgREST), the
 * same way every manual RLS verification this session used
 * (`supabase db query --linked` + `SET ROLE authenticated; SET
 * request.jwt.claims = '...'`) — reusing that exact, already-proven
 * technique rather than inventing a new one.
 *
 * HARD SAFETY GUARD: refuses to connect to anything but a loopback host.
 * These tests must only ever run against a disposable local Supabase
 * instance (`supabase start`) — never the remote/hosted project. There is
 * no override for this; if you need to point somewhere else, you are
 * doing something this suite is deliberately designed to prevent.
 */

const DEFAULT_LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function resolveConnectionString(): string {
  const raw = process.env.TEST_DATABASE_URL ?? DEFAULT_LOCAL_URL;
  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    throw new Error(`TEST_DATABASE_URL is not a valid connection URL: ${raw}`);
  }
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error(
      `Refusing to run database tests against host "${host}". ` +
        `tests/db/** must only run against a disposable LOCAL Supabase instance ` +
        `(run "supabase start" first). If you intended to test locally, check ` +
        `TEST_DATABASE_URL — it must resolve to 127.0.0.1/localhost.`,
    );
  }
  return raw;
}

export const sql = postgres(resolveConnectionString(), { max: 5, prepare: false });

/**
 * Runs `fn` impersonating `userId` under full RLS enforcement, exactly as a
 * real authenticated PostgREST/Server-Function request would — `SET LOCAL`
 * scopes both the role switch and the JWT claim to this one transaction
 * only, auto-reverting when it ends (commit or rollback). This is the
 * `SET ROLE authenticated; SET request.jwt.claims = '...'` pattern proven
 * manually throughout the engineering review, wrapped for reuse.
 */
export async function asUser<T>(userId: string, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  const result = await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
    await tx.unsafe(`set local role authenticated`);
    return fn(tx);
  });
  return result as T;
}

/** A short, unique-enough suffix for disposable fixture names — avoids collisions between tests/files without needing full UUIDs in human-readable labels. */
export function uniqueSuffix(): string {
  return randomUUID().slice(0, 8);
}

// ── Fixture builders — all run as the plain `sql` connection (the local
// dev Postgres role is superuser-equivalent and bypasses RLS, exactly the
// "service-role/manual operation" pattern companies.sql documents as
// the intended way to create an company). ──────────────────────────

export type TestCompany = { companyId: string; slug: string };

export async function createTestCompany(label: string): Promise<TestCompany> {
  const slug = `test-${label}-${uniqueSuffix()}`;
  const prefix = slug.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const [row] = await sql`
    insert into companies (name, slug, employee_number_prefix, status)
    values (${`Test Company (${label})`}, ${slug}, ${prefix}, 'active')
    returning id
  `;
  return { companyId: row.id as string, slug };
}

/** Cascades away every company-scoped row (see supabase/migrations — every tenant table's company_id FK is `on delete cascade`). */
export async function deleteTestCompany(companyId: string): Promise<void> {
  await sql`delete from companies where id = ${companyId}`;
}

export type TestUser = { userId: string; email: string };

/**
 * Creates a minimal auth.users row directly — legitimate ONLY in a test
 * fixture context running as the local superuser role, mirroring the same
 * pattern pgTAP-based Supabase RLS test suites use. Application code never
 * does this (see lib/supabase/admin.ts / scripts/seed-test-company.ts, which
 * use the real Admin API instead) — this shortcut is acceptable here
 * specifically because these rows never leave a disposable local database
 * and are deleted at the end of every test.
 *
 * profiles.id has a hard FK to auth.users(id) (on delete cascade), and the
 * handle_new_user() trigger fires synchronously on this INSERT to create
 * the matching profiles row — no separate profile insert needed.
 */
export async function createTestUser(fullName: string): Promise<TestUser> {
  const userId = randomUUID();
  const email = `${userId}@example.test`;
  await sql`
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
    ) values (
      ${userId}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      ${email}, '', now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      ${JSON.stringify({ full_name: fullName })}::jsonb,
      false, false
    )
  `;
  return { userId, email };
}

/** Cascades to the matching profiles row. */
export async function deleteTestUser(userId: string): Promise<void> {
  await sql`delete from auth.users where id = ${userId}`;
}

export async function addMembership(
  companyId: string,
  userId: string,
  roleNames: string[],
  status: "active" | "invited" | "suspended" | "removed" = "active",
): Promise<string> {
  const [row] = await sql`
    insert into company_memberships (company_id, user_id, status, joined_at)
    values (${companyId}, ${userId}, ${status}, now())
    returning id
  `;
  for (const roleName of roleNames) {
    await sql`
      insert into membership_roles (company_id, membership_id, role_id)
      select ${companyId}, ${row.id}, id from roles where name = ${roleName}
    `;
  }
  return row.id as string;
}

export async function createTestEmployee(
  companyId: string,
  profileId: string | null,
  firstName: string,
  lastName: string,
): Promise<string> {
  const [row] = await sql`
    insert into employees (company_id, profile_id, employee_number, first_name, last_name, employment_status, start_date)
    values (${companyId}, ${profileId}, ${`EMP-${uniqueSuffix()}`}, ${firstName}, ${lastName}, 'active', current_date)
    returning id
  `;
  // employees_create_initial_period (AFTER INSERT) + sync trigger already
  // ran synchronously as part of this INSERT — employment_status above is
  // a placeholder to satisfy NOT NULL, immediately overwritten to 'active'
  // by the sync trigger from the freshly-opened employment period.
  return row.id as string;
}

export async function createTestProject(companyId: string, name: string, status: "planning" | "active" | "completed" | "archived" = "active"): Promise<string> {
  const [row] = await sql`
    insert into projects (company_id, name, status)
    values (${companyId}, ${name}, ${status})
    returning id
  `;
  return row.id as string;
}

export async function createTestTeam(companyId: string, projectId: string, name: string): Promise<string> {
  const [row] = await sql`
    insert into teams (company_id, project_id, name)
    values (${companyId}, ${projectId}, ${name})
    returning id
  `;
  return row.id as string;
}

export async function roleId(roleName: string): Promise<string> {
  const [row] = await sql`select id from roles where name = ${roleName}`;
  if (!row) throw new Error(`role ${roleName} not found — is supabase/seed.sql's role catalogue applied?`);
  return row.id as string;
}

/** Extracted from what was seven copies of the same inline lookup across tests/db/role-permissions.test.ts. */
export async function getMembershipId(companyId: string, userId: string): Promise<string> {
  const [row] = await sql`select id from company_memberships where company_id = ${companyId} and user_id = ${userId}`;
  if (!row) throw new Error(`no company_memberships row for company ${companyId} / user ${userId}`);
  return row.id as string;
}

/**
 * Specific Postgres SQLSTATEs to assert against instead of a bare
 * `.rejects.toThrow()` — asserting on the exact code is what makes a
 * "this should be rejected" test fail loudly if the query breaks for an
 * unrelated reason (a typo'd column, say) instead of silently passing for
 * the wrong reason. Mirrors the same codes lib/supabase/errors.ts's
 * classifiers check, for the same invariants, from the other direction.
 */
export const RLS_VIOLATION = { code: "42501" }; // insufficient_privilege — an RLS policy (or a missing GRANT) rejected the operation
export const UNIQUE_VIOLATION = { code: "23505" }; // a partial/unique index already has a matching open row
export const FK_VIOLATION = { code: "23503" }; // a composite FK (e.g. teams_project_fk) rejected a cross-company reference
export const RAISED_EXCEPTION = { code: "P0001" }; // an explicit `raise exception` in a guard trigger/function with no overridden SQLSTATE (isRaisedException()'s exact check, from the DB side)
export const CHECK_VIOLATION = { code: "23514" }; // a plain table CHECK constraint (not a trigger) rejected the row
