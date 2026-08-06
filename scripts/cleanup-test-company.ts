/**
 * Removes all "Northstar Scaffolding Test AB" test data created by
 * scripts/seed-test-company.ts. Never touches any other company (Valutris
 * included) and never deletes the requester's own platform account — only
 * that account's membership/role in THIS company is removed (by virtue of it
 * being scoped to this company's id, exactly like every other row here).
 *
 * Every company-scoped table (projects, project_assignments, teams,
 * team_assignments, employees, employee_employment_periods,
 * company_memberships, membership_roles) has an
 * `company_id ... references companies (id) on delete cascade` FK
 * — confirmed by reading every migration that defines one. Deleting the
 * `companies` row itself is therefore sufficient and FK-safe; there is
 * no manual per-table deletion order to get wrong.
 *
 * Run: npm run cleanup:test-company
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

function loadEnvLocal() {
  const path = resolve(__dirname, "..", ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} (check .env.local)`);
  return value;
}

const admin = createSupabaseClient<Database>(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SECRET_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const COMPANY_SLUG = "northstar-scaffolding-test";

// Auth accounts this seed can create — deleted here too, since they exist
// for no purpose outside this test company. The requester's own account is
// deliberately NOT in this list.
const SEED_ACCOUNT_EMAILS = [
  "northstar.cm@example.com",
  "northstar.wc@example.com",
  "northstar.pm@example.com",
  "northstar.hseq@example.com",
  "northstar.foreman1@example.com",
  "northstar.foreman2@example.com",
  "northstar.hse1@example.com",
  "northstar.hse2@example.com",
  "northstar.inspector1@example.com",
  "northstar.inspector2@example.com",
  "northstar.planner@example.com",
  "northstar.recruiter@example.com",
];

async function main() {
  console.log(`\n=== Cleaning up Northstar Scaffolding Test AB (slug: ${COMPANY_SLUG}) ===\n`);

  const { data: company, error: orgErr } = await admin
    .from("companies")
    .select("id, name")
    .eq("slug", COMPANY_SLUG)
    .maybeSingle();
  if (orgErr) throw orgErr;

  if (!company) {
    console.log("No company with this slug exists — nothing to clean up.");
  } else {
    const { error: delErr } = await admin.from("companies").delete().eq("id", company.id);
    if (delErr) throw delErr;
    console.log(`Deleted company "${company.name}" (${company.id}) and everything cascaded from it ` +
      `(projects, teams, project/team assignments, employees, employment periods, memberships, membership roles).`);
  }

  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw listErr;

  let deletedUsers = 0;
  for (const email of SEED_ACCOUNT_EMAILS) {
    const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) {
      console.log(`  auth user ${email}: not found, skipped`);
      continue;
    }
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      console.log(`  auth user ${email}: FAILED to delete (${error.message})`);
      continue;
    }
    console.log(`  auth user ${email}: deleted`);
    deletedUsers++;
  }

  console.log(`\nDone. ${deletedUsers}/${SEED_ACCOUNT_EMAILS.length} seed auth accounts removed.\n`);
}

main().catch((err) => {
  console.error("\nCleanup failed:", err);
  process.exit(1);
});
