/**
 * DEV-ONLY, disposable role-validation REALISTIC DATA seed.
 *
 * Companion to scripts/seed-role-validation-fixtures.ts (which owns the 11
 * core role auth accounts + company/project/membership/role layer — run
 * that FIRST). This script expands "TEST — Role Validation Company" /
 * "TEST — Role Validation Project" into a realistic, weeks-old-looking
 * fixture: more employees, Today's Teams across several days, attendance/
 * leave, worked hours, LMRA, scaffolds/inspections, observations,
 * corrective actions, toolbox meetings/templates, safety flash, equipment,
 * and (where the app has no service_role grant on a table — most of these
 * — RLS forces every write through a real authenticated session, exactly
 * like a genuine user) notifications fired by real triggers.
 *
 * Same safety posture as the auth script: hard-refuses without
 * ALLOW_ROLE_VALIDATION_SEED=true, every email touched must match
 * test.<name>@example.test, never touches cristi.3ddd@gmail.com or any
 * other real identity, never touches any company/project other than the
 * ones this script itself creates.
 *
 * Idempotent: every entity is looked up by a deterministic fixture key
 * (name/tag/date combination) before insert — safe to re-run.
 *
 * Run: ALLOW_ROLE_VALIDATION_SEED=true npx tsx scripts/seed-role-validation-realistic-data.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

type AdminClient = ReturnType<typeof createSupabaseClient<Database>>;

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

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const ANON_KEY = requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const admin: AdminClient = createSupabaseClient<Database>(SUPABASE_URL, requireEnv("SUPABASE_SECRET_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const FIXTURE_EMAIL_PATTERN = /^test\.[a-z0-9]+@example\.test$/;
function assertFixtureEmail(email: string) {
  if (!FIXTURE_EMAIL_PATTERN.test(email)) {
    throw new Error(`REFUSING to touch "${email}" — does not match the disposable fixture pattern test.<name>@example.test.`);
  }
}

function assertSeedAllowed() {
  if (process.env.ALLOW_ROLE_VALIDATION_SEED !== "true") {
    throw new Error(
      "REFUSING to run: ALLOW_ROLE_VALIDATION_SEED=true is not set. Run as: ALLOW_ROLE_VALIDATION_SEED=true npx tsx scripts/seed-role-validation-realistic-data.ts",
    );
  }
}

type Action = "created" | "reused" | "skipped" | "updated";
const report: { section: string; item: string; action: Action; detail?: string }[] = [];
function log(section: string, item: string, action: Action, detail?: string) {
  report.push({ section, item, action, detail });
  const tag = { created: "+ created", reused: "= reused", skipped: "- skipped", updated: "~ updated" }[action];
  console.log(`[${section}] ${tag}: ${item}${detail ? ` (${detail})` : ""}`);
}

const COMPANY_SLUG = "test-role-validation";
const PROJECT_CODE = "TEST-ROLE-01";
const SECONDARY_PROJECT_CODE = "TEST-ROLE-02";
const SECONDARY_COMPANY_SLUG = "test-isolation-company-b";

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}
const TODAY = isoDate(0);

/** A signed-in supabase-js client acting AS one fixture user — RLS-scoped, exactly like a real session (these tables force RLS with no service_role bypass, so this is the only correct way to seed them). */
async function signInAs(email: string, password: string) {
  assertFixtureEmail(email);
  const client = createSupabaseClient<Database>(SUPABASE_URL, ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return client;
}

const STABLE_PASSWORDS: Record<string, string> = {
  platform_super_admin: "TestPlatformAdmin2026!",
  company_admin: "TestCompanyAdmin2026!",
  operations_manager: "TestOpsManager2026!",
  project_manager: "TestProjectMgr2026!",
  hseq_manager: "TestHseqManager2026!",
  hse_officer: "TestHseOfficer2026!",
  foreman: "TestForeman2026!",
  inspector: "TestInspector2026!",
  planner: "TestPlanner2026!",
  recruiter: "TestRecruiter2026!",
  employee: "TestEmployee2026!",
};

// ============================================================================
// Phase A — resolve the existing core fixture company/project/role-account
// ids (created by seed-role-validation-fixtures.ts, which must run first).
// ============================================================================
async function resolveCoreFixtures() {
  const { data: company, error: companyErr } = await admin.from("companies").select("id, name").eq("slug", COMPANY_SLUG).maybeSingle();
  if (companyErr) throw companyErr;
  if (!company) throw new Error(`"${COMPANY_SLUG}" company not found — run seed-role-validation-fixtures.ts first.`);

  const { data: project, error: projectErr } = await admin.from("projects").select("id, name").eq("company_id", company.id).eq("code", PROJECT_CODE).maybeSingle();
  if (projectErr) throw projectErr;
  if (!project) throw new Error(`"${PROJECT_CODE}" project not found — run seed-role-validation-fixtures.ts first.`);

  const { data: employees, error: empErr } = await admin.from("employees").select("id, work_email, first_name, last_name").eq("company_id", company.id);
  if (empErr) throw empErr;
  const employeeIdByEmail = new Map((employees ?? []).map((e) => [e.work_email?.toLowerCase() ?? "", e.id]));

  return { companyId: company.id, projectId: project.id, employeeIdByEmail };
}

// ============================================================================
// Phase B — extra supporting fixture accounts (2 more Foremen so Today's
// Teams can have "at least 3 Foremen", 1 suspended-membership account).
// These are ADDITIONAL to the 11 core role-validation accounts, not a
// replacement for any of them.
// ============================================================================
const SUPPORTING_ACCOUNTS: { email: string; password: string; fullName: string; firstName: string; lastName: string; positionTitle: string; roleName: string }[] = [
  { email: "test.foreman2@example.test", password: "TestForemanTwo2026!", fullName: "Bravo Foreman (TEST)", firstName: "Bravo", lastName: "Foreman (TEST)", positionTitle: "Foreman", roleName: "foreman" },
  { email: "test.foreman3@example.test", password: "TestForemanThree2026!", fullName: "Charlie Foreman (TEST)", firstName: "Charlie", lastName: "Foreman (TEST)", positionTitle: "Foreman", roleName: "foreman" },
  { email: "test.suspendedworker@example.test", password: "TestSuspended2026!", fullName: "Suspended Worker (TEST)", firstName: "Suspended", lastName: "Worker (TEST)", positionTitle: "Laborer", roleName: "employee" },
  // Operational-realism pass (Fri 21/Sat 22/Sun 23 Aug 2026 fixture) —
  // a 4th Foreman for a Delta team (Friday needs "approximately 4-5"
  // active teams; the existing 3 core Foremen already staff Alpha/Bravo/
  // Charlie), and a second ordinary Employee-role login specifically for
  // the "worker on approved holiday today, back on a team tomorrow"
  // availability-panel scenario (plain workers have no auth account, so
  // they structurally cannot self-submit a leave_requests row — RLS
  // requires employee.profile_id = auth.uid()).
  { email: "test.foreman4@example.test", password: "TestForemanFour2026!", fullName: "Delta Foreman (TEST)", firstName: "Delta", lastName: "Foreman (TEST)", positionTitle: "Foreman", roleName: "foreman" },
  { email: "test.employee2@example.test", password: "TestEmployeeTwo2026!", fullName: "Second Employee (TEST)", firstName: "Second", lastName: "Employee (TEST)", positionTitle: "Scaffolder", roleName: "employee" },
];

async function ensureSupportingAuthUser(email: string, password: string, fullName: string): Promise<string> {
  assertFixtureEmail(email);
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw listErr;
  const found = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (found) {
    await admin.auth.admin.updateUserById(found.id, { password, email_confirm: true, ban_duration: "none", user_metadata: { full_name: fullName, seed_source: "role-validation-realistic-data" } });
    log("supporting-auth-user", email, "updated", "normalized password + confirmed");
    return found.id;
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName, seed_source: "role-validation-realistic-data" } });
  if (error || !data.user) throw error ?? new Error(`createUser returned no user for ${email}`);
  log("supporting-auth-user", email, "created", data.user.id);
  return data.user.id;
}

async function waitForProfile(userId: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
    if (data) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`profiles row for ${userId} never appeared`);
}

/**
 * Closure fix — Today's Teams/Employee Dashboard's Foreman contact row has
 * nothing to visibly render without at least one real fixture phone number.
 * Only accounts with a real `profiles` row (i.e. a real login, unlike the
 * "plain employee" HR-only records used for the rest of Team Alpha's
 * roster) can have one at all — get_daily_team_phone_numbers() reads
 * `profiles.phone` exclusively. E.164 format, matching the
 * `profiles_phone_e164` constraint. `service_role` can write `profiles`
 * directly (unlike `projects`, see ensureProject's own comment) — this is
 * the same table `waitForProfile` above already updates.
 */
async function ensureFixturePhone(email: string, phoneE164: string): Promise<void> {
  assertFixtureEmail(email);
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw listErr;
  const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`ensureFixturePhone: no auth user found for ${email}`);

  const { data: profile, error } = await admin.from("profiles").select("phone").eq("id", user.id).maybeSingle();
  if (error) throw error;
  if (profile?.phone === phoneE164) {
    log("profile-phone", email, "reused", phoneE164);
    return;
  }
  const { error: updErr } = await admin.from("profiles").update({ phone: phoneE164 }).eq("id", user.id);
  if (updErr) throw updErr;
  log("profile-phone", email, "updated", phoneE164);
}

async function ensureMembership(companyId: string, userId: string, email: string, status: "active" | "suspended" = "active"): Promise<string> {
  const { data: existing } = await admin.from("company_memberships").select("id, status").eq("company_id", companyId).eq("user_id", userId).maybeSingle();
  if (existing) {
    if (existing.status !== status) {
      await admin.from("company_memberships").update({ status }).eq("id", existing.id);
      log("membership", email, "updated", status);
    } else {
      log("membership", email, "reused", existing.id);
    }
    return existing.id;
  }
  const { data, error } = await admin.from("company_memberships").insert({ company_id: companyId, user_id: userId, status, joined_at: new Date().toISOString() }).select("id").single();
  if (error) throw error;
  log("membership", email, "created", data.id);
  return data.id;
}

async function ensureExactMembershipRole(companyId: string, membershipId: string, roleName: string, email: string) {
  const { data: role, error: roleErr } = await admin.from("roles").select("id").eq("name", roleName).is("company_id", null).single();
  if (roleErr || !role) throw roleErr ?? new Error(`role ${roleName} not found`);
  const { data: currentRoles } = await admin.from("membership_roles").select("id, role_id").eq("membership_id", membershipId);
  const alreadyHasIt = (currentRoles ?? []).some((r) => r.role_id === role.id);
  if (alreadyHasIt) {
    log("membership-role", `${email} -> ${roleName}`, "reused");
    return;
  }
  const { error } = await admin.from("membership_roles").insert({ company_id: companyId, membership_id: membershipId, role_id: role.id });
  if (error) throw error;
  log("membership-role", `${email} -> ${roleName}`, "created");
}

async function ensureEmployeeForAuthUser(companyId: string, profileId: string, fullName: string, firstName: string, lastName: string, positionTitle: string, workEmail: string): Promise<string> {
  const { data: existing } = await admin.from("employees").select("id, profile_id").eq("company_id", companyId).eq("work_email", workEmail).maybeSingle();
  if (existing) {
    if (existing.profile_id !== profileId) await admin.from("employees").update({ profile_id: profileId }).eq("id", existing.id);
    log("employee", fullName, "reused", existing.id);
    return existing.id;
  }
  const { data: employeeNumber, error: numErr } = await admin.rpc("allocate_employee_number", { target_org_id: companyId });
  if (numErr || !employeeNumber) throw numErr ?? new Error("allocate_employee_number returned nothing");
  const { data, error } = await admin
    .from("employees")
    .insert({ company_id: companyId, employee_number: employeeNumber, first_name: firstName, last_name: lastName, work_email: workEmail, position_title: positionTitle, employment_status: "active", account_status: "active", start_date: TODAY, profile_id: profileId })
    .select("id")
    .single();
  if (error) throw error;
  log("employee", fullName, "created", data.id);
  return data.id;
}

/** is_eligible_scaffold_foreman() (the same check daily_teams/scaffolds use) requires a company 'foreman' role AND an active team_assignments row with assignment_role='foreman' on THIS project — the older static-team model, unrelated to Today's Teams. Reuses the existing "TEST Static Team" row as the vehicle (matches how test.foreman's own eligibility was already established). */
async function ensureTeamAssignmentForeman(companyId: string, projectId: string, staticTeamId: string, foremanEmployeeId: string, label: string) {
  const { data: existing } = await admin.from("team_assignments").select("id").eq("project_id", projectId).eq("employee_id", foremanEmployeeId).eq("assignment_role", "foreman").is("end_at", null).maybeSingle();
  if (existing) {
    log("team-assignment", `${label} -> TEST Static Team`, "reused");
    return;
  }
  const { error } = await admin.from("team_assignments").insert({ company_id: companyId, project_id: projectId, team_id: staticTeamId, employee_id: foremanEmployeeId, assignment_role: "foreman", start_at: new Date().toISOString() });
  if (error) throw error;
  log("team-assignment", `${label} -> TEST Static Team`, "created");
}

async function ensureProjectAssignment(companyId: string, projectId: string, employeeId: string, role: Database["public"]["Enums"]["project_assignment_role"], label: string) {
  const { data: existing } = await admin.from("project_assignments").select("id").eq("project_id", projectId).eq("employee_id", employeeId).eq("assignment_role", role).is("end_at", null).maybeSingle();
  if (existing) {
    log("project-assignment", `${label} -> ${role}`, "reused");
    return;
  }
  const { error } = await admin.from("project_assignments").insert({ company_id: companyId, project_id: projectId, employee_id: employeeId, assignment_role: role });
  if (error) throw error;
  log("project-assignment", `${label} -> ${role}`, "created");
}

// ============================================================================
// Phase C — plain worker-pool employees (no auth accounts) + onboarding-
// state examples (Part 17).
// ============================================================================
type PlainEmployeeSpec = {
  key: string; // stable fixture key, used as work_email local-part
  firstName: string;
  lastName: string;
  positionTitle: string;
  employmentStatus: Database["public"]["Enums"]["employment_status"];
  accountStatus: Database["public"]["Enums"]["employee_account_status"];
  startDaysAgo: number;
  endDaysAgo?: number;
  archived?: boolean;
};

const PLAIN_WORKERS: PlainEmployeeSpec[] = [
  { key: "worker01", firstName: "TEST", lastName: "Worker 01 (Welder)", positionTitle: "Welder", employmentStatus: "active", accountStatus: "active", startDaysAgo: 90 },
  { key: "worker02", firstName: "TEST", lastName: "Worker 02 (Rigger)", positionTitle: "Rigger", employmentStatus: "active", accountStatus: "active", startDaysAgo: 88 },
  { key: "worker03", firstName: "TEST", lastName: "Worker 03 (Scaffolder)", positionTitle: "Scaffolder", employmentStatus: "active", accountStatus: "active", startDaysAgo: 85 },
  { key: "worker04", firstName: "TEST", lastName: "Worker 04 (Electrician)", positionTitle: "Electrician", employmentStatus: "active", accountStatus: "active", startDaysAgo: 80 },
  { key: "worker05", firstName: "TEST", lastName: "Worker 05 (Pipefitter)", positionTitle: "Pipefitter", employmentStatus: "active", accountStatus: "active", startDaysAgo: 75 },
  { key: "worker06", firstName: "TEST", lastName: "Worker 06 (Crane Operator)", positionTitle: "Crane Operator", employmentStatus: "active", accountStatus: "active", startDaysAgo: 70 },
  { key: "worker07", firstName: "TEST", lastName: "Worker 07 (Laborer)", positionTitle: "Laborer", employmentStatus: "active", accountStatus: "active", startDaysAgo: 65 },
  { key: "worker08", firstName: "TEST", lastName: "Worker 08 (Laborer)", positionTitle: "Laborer", employmentStatus: "active", accountStatus: "active", startDaysAgo: 60 },
  { key: "worker09", firstName: "TEST", lastName: "Worker 09 (Mechanic)", positionTitle: "Mechanic", employmentStatus: "active", accountStatus: "active", startDaysAgo: 55 },
  { key: "worker10", firstName: "TEST", lastName: "Worker 10 (Painter)", positionTitle: "Painter", employmentStatus: "active", accountStatus: "active", startDaysAgo: 50 },
  { key: "worker11", firstName: "TEST", lastName: "Worker 11 (Insulator)", positionTitle: "Insulator", employmentStatus: "active", accountStatus: "active", startDaysAgo: 45 },
  { key: "worker12", firstName: "TEST", lastName: "Worker 12 (Storeman)", positionTitle: "Storeman", employmentStatus: "active", accountStatus: "active", startDaysAgo: 40 },
  { key: "newhire", firstName: "TEST", lastName: "New Hire (TEST)", positionTitle: "Laborer", employmentStatus: "active", accountStatus: "pending_activation", startDaysAgo: 0 },
  { key: "invitedworker", firstName: "TEST", lastName: "Invited Worker (TEST)", positionTitle: "Electrician", employmentStatus: "active", accountStatus: "invited", startDaysAgo: 3 },
  { key: "offboardedworker", firstName: "TEST", lastName: "Offboarded Worker (TEST)", positionTitle: "Laborer", employmentStatus: "terminated", accountStatus: "archived", startDaysAgo: 120, endDaysAgo: 20, archived: true },
  // Operational-realism pass — Team Delta's crew (worker13-16), plus two
  // more active, project-assigned workers deliberately left OFF every
  // Friday team so the Available/Unassigned panel has real "confirmed
  // absent" (worker17) and "available but still unassigned" (worker18)
  // examples beyond the ones already fully staffed on Alpha/Bravo/Charlie/Delta.
  { key: "worker13", firstName: "TEST", lastName: "Worker 13 (Scaffolder)", positionTitle: "Scaffolder", employmentStatus: "active", accountStatus: "active", startDaysAgo: 38 },
  { key: "worker14", firstName: "TEST", lastName: "Worker 14 (Rigger)", positionTitle: "Rigger", employmentStatus: "active", accountStatus: "active", startDaysAgo: 36 },
  { key: "worker15", firstName: "TEST", lastName: "Worker 15 (Laborer)", positionTitle: "Laborer", employmentStatus: "active", accountStatus: "active", startDaysAgo: 34 },
  { key: "worker16", firstName: "TEST", lastName: "Worker 16 (Welder)", positionTitle: "Welder", employmentStatus: "active", accountStatus: "active", startDaysAgo: 32 },
  { key: "worker17", firstName: "TEST", lastName: "Worker 17 (Pipefitter)", positionTitle: "Pipefitter", employmentStatus: "active", accountStatus: "active", startDaysAgo: 30 },
  { key: "worker18", firstName: "TEST", lastName: "Worker 18 (Laborer)", positionTitle: "Laborer", employmentStatus: "active", accountStatus: "active", startDaysAgo: 28 },
];

async function ensurePlainEmployee(companyId: string, spec: PlainEmployeeSpec): Promise<string> {
  const workEmail = `fixture.${spec.key}@example.test`;
  const { data: existing } = await admin.from("employees").select("id").eq("company_id", companyId).eq("work_email", workEmail).maybeSingle();
  if (existing) {
    log("plain-employee", `${spec.firstName} ${spec.lastName}`, "reused", existing.id);
    return existing.id;
  }
  const { data: employeeNumber, error: numErr } = await admin.rpc("allocate_employee_number", { target_org_id: companyId });
  if (numErr || !employeeNumber) throw numErr ?? new Error("allocate_employee_number returned nothing");
  const { data, error } = await admin
    .from("employees")
    .insert({
      company_id: companyId,
      employee_number: employeeNumber,
      first_name: spec.firstName,
      last_name: spec.lastName,
      work_email: workEmail,
      position_title: spec.positionTitle,
      employment_status: spec.employmentStatus,
      account_status: spec.accountStatus,
      start_date: isoDate(spec.startDaysAgo),
      end_date: spec.endDaysAgo !== undefined ? isoDate(spec.endDaysAgo) : null,
      archived_at: spec.archived ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) throw error;
  log("plain-employee", `${spec.firstName} ${spec.lastName}`, "created", data.id);
  return data.id;
}

// ============================================================================
// Phase D — secondary project (same company) + optional secondary company,
// for cross-project / cross-company isolation testing.
// ============================================================================
async function ensureSecondaryProject(companyId: string): Promise<string> {
  const { data: existing, error } = await admin.from("projects").select("id").eq("company_id", companyId).eq("code", SECONDARY_PROJECT_CODE).maybeSingle();
  if (error) throw error;
  if (existing) {
    log("secondary-project", "TEST — Secondary Project", "reused", existing.id);
    return existing.id;
  }
  const { data, error: insErr } = await admin
    .from("projects")
    .insert({ company_id: companyId, name: "TEST — Secondary Project", code: SECONDARY_PROJECT_CODE, status: "active", client_name: "TEST Fixture Client B", location: "TEST Fixture Site B", start_date: isoDate(30) })
    .select("id")
    .single();
  if (insErr) throw insErr;
  log("secondary-project", "TEST — Secondary Project", "created", data.id);
  return data.id;
}

async function ensureIsolationCompanyB(): Promise<{ companyId: string; projectId: string }> {
  const { data: existingCompany, error } = await admin.from("companies").select("id").eq("slug", SECONDARY_COMPANY_SLUG).maybeSingle();
  if (error) throw error;
  let companyId: string;
  if (existingCompany) {
    log("isolation-company-b", "TEST — Isolation Company B", "reused", existingCompany.id);
    companyId = existingCompany.id;
  } else {
    const { data, error: insErr } = await admin.from("companies").insert({ name: "TEST — Isolation Company B", slug: SECONDARY_COMPANY_SLUG, employee_number_prefix: "TESTISOB", status: "active" }).select("id").single();
    if (insErr) throw insErr;
    log("isolation-company-b", "TEST — Isolation Company B", "created", data.id);
    companyId = data.id;
  }

  const { data: existingProject, error: projErr } = await admin.from("projects").select("id").eq("company_id", companyId).eq("code", "TEST-ISOB-01").maybeSingle();
  if (projErr) throw projErr;
  let projectId: string;
  if (existingProject) {
    log("isolation-company-b-project", "TEST — Isolation B Project", "reused", existingProject.id);
    projectId = existingProject.id;
  } else {
    const { data, error: insErr } = await admin
      .from("projects")
      .insert({ company_id: companyId, name: "TEST — Isolation B Project", code: "TEST-ISOB-01", status: "active", client_name: "TEST Fixture Client C", location: "TEST Fixture Site C", start_date: isoDate(20) })
      .select("id")
      .single();
    if (insErr) throw insErr;
    log("isolation-company-b-project", "TEST — Isolation B Project", "created", data.id);
    projectId = data.id;
  }
  return { companyId, projectId };
}

const ISOLATION_B_EMPLOYEES: PlainEmployeeSpec[] = [
  { key: "isobworker01", firstName: "TEST-B", lastName: "IsoWorker 01 (TEST)", positionTitle: "Laborer", employmentStatus: "active", accountStatus: "active", startDaysAgo: 20 },
  { key: "isobworker02", firstName: "TEST-B", lastName: "IsoWorker 02 (TEST)", positionTitle: "Welder", employmentStatus: "active", accountStatus: "active", startDaysAgo: 18 },
  { key: "isobworker03", firstName: "TEST-B", lastName: "IsoWorker 03 (TEST)", positionTitle: "Foreman", employmentStatus: "active", accountStatus: "active", startDaysAgo: 20 },
];

// ============================================================================
// Phase E — Today's Teams (daily_teams/daily_team_members). Every write
// goes through the REAL RPCs via a signed-in company_admin session — these
// tables force RLS with no service_role bypass, so this is the only
// correct way to seed them (and it exercises the exact same business
// rules/triggers a real user would).
// ============================================================================
type TeamSpec = { key: string; foremanEmail: string; foremanEmployeeId: string; name: string; shift: "day" | "night" | "late"; workArea: string; activity: string; workerKeys: string[] };

async function ensureDailyTeamsForDate(
  adminSession: Awaited<ReturnType<typeof signInAs>>,
  companyId: string,
  projectId: string,
  workDate: string,
  teamSpecs: TeamSpec[],
  employeeIdByKey: Record<string, string>,
): Promise<Record<string, string>> {
  const dailyTeamIdBySpecKey: Record<string, string> = {};

  const { data: existingTeams } = await adminSession.from("daily_teams").select("id, name").eq("company_id", companyId).eq("project_id", projectId).eq("work_date", workDate);
  const existingByName = new Map((existingTeams ?? []).map((t) => [t.name, t.id]));

  for (const spec of teamSpecs) {
    if (existingByName.has(spec.name)) {
      dailyTeamIdBySpecKey[spec.key] = existingByName.get(spec.name)!;
      log("daily-team", `${spec.name} (${workDate})`, "reused");
      continue;
    }

    const { error: rosterErr } = await adminSession.rpc("add_daily_team_foreman", { target_project_id: projectId, target_work_date: workDate, target_foreman_employee_id: spec.foremanEmployeeId });
    if (rosterErr && !rosterErr.message.includes("already")) throw new Error(`add_daily_team_foreman(${spec.name}, ${workDate}): ${rosterErr.message}`);

    const { data: team, error: teamErr } = await adminSession
      .rpc("create_daily_team_for_foreman", {
        target_project_id: projectId,
        target_work_date: workDate,
        target_foreman_employee_id: spec.foremanEmployeeId,
        target_name: spec.name,
        target_shift: spec.shift,
        target_work_area: spec.workArea,
        target_activity: spec.activity,
      })
      .single();
    if (teamErr || !team) throw new Error(`create_daily_team_for_foreman(${spec.name}, ${workDate}): ${teamErr?.message}`);
    const dailyTeamId = (team as { id: string }).id;
    dailyTeamIdBySpecKey[spec.key] = dailyTeamId;
    log("daily-team", `${spec.name} (${workDate})`, "created", dailyTeamId);

    let assignedCount = 0;
    for (const workerKey of spec.workerKeys) {
      const employeeId = employeeIdByKey[workerKey];
      if (!employeeId) throw new Error(`Unknown worker key "${workerKey}" for team ${spec.name}`);
      const { error: moveErr } = await adminSession.rpc("move_daily_team_member", { target_project_id: projectId, target_work_date: workDate, target_daily_team_id: dailyTeamId, target_employee_id: employeeId, target_role: "member" });
      if (moveErr) {
        // Part 11's provisional-unavailability guard (20260902160000) is
        // expected to legitimately reject a team assignment for someone
        // with a pending leave/absence request covering this date — the
        // "employee-pending-leave" fixture's dates are real calendar dates
        // fixed at insert time, so as real time passes this can genuinely
        // collide with "today"/"tomorrow" team continuation. Skip that one
        // worker (matching real product behavior — a team copy simply
        // can't include someone who's provisionally unavailable) rather
        // than failing the whole seed run; any OTHER error still throws.
        if (moveErr.message.includes("pending leave/absence request")) {
          log("daily-team-members", `${spec.name} (${workDate})`, "skipped", `${workerKey} provisionally unavailable`);
          continue;
        }
        throw new Error(`move_daily_team_member(${workerKey} -> ${spec.name}, ${workDate}): ${moveErr.message}`);
      }
      assignedCount++;
    }
    log("daily-team-members", `${spec.name} (${workDate})`, "created", `${assignedCount} workers`);
  }

  return dailyTeamIdBySpecKey;
}

async function lockDateIfOpen(adminSession: Awaited<ReturnType<typeof signInAs>>, projectId: string, workDate: string) {
  const { data: openTeams } = await adminSession.from("daily_teams").select("id").eq("project_id", projectId).eq("work_date", workDate).eq("status", "open");
  if (!openTeams || openTeams.length === 0) {
    log("daily-team-lock", workDate, "reused", "already locked or no teams");
    return;
  }
  const { error } = await adminSession.rpc("lock_daily_teams", { target_project_id: projectId, target_work_date: workDate });
  if (error) throw new Error(`lock_daily_teams(${workDate}): ${error.message}`);
  log("daily-team-lock", workDate, "created", "locked as historical evidence");
}

// ============================================================================
// Phase F — Attendance / Absence / Leave.
// ============================================================================
async function ensureLeaveRequest(
  requesterSession: Awaited<ReturnType<typeof signInAs>>,
  companyId: string,
  projectId: string,
  employeeId: string,
  requestedByUserId: string,
  leaveType: Database["public"]["Enums"]["leave_type"],
  startDate: string,
  endDate: string,
  comment: string,
  fixtureKey: string,
): Promise<string | null> {
  const { data: existing } = await requesterSession.from("leave_requests").select("id, status").eq("company_id", companyId).eq("project_id", projectId).eq("employee_id", employeeId).eq("start_date", startDate).eq("end_date", endDate).maybeSingle();
  if (existing) {
    log("leave-request", fixtureKey, "reused", existing.status);
    return existing.id;
  }
  const { data, error } = await requesterSession
    .from("leave_requests")
    .insert({ company_id: companyId, project_id: projectId, employee_id: employeeId, leave_type: leaveType, start_date: startDate, end_date: endDate, employee_comment: comment, requested_by: requestedByUserId })
    .select("id")
    .single();
  if (error) throw new Error(`leave_requests insert (${fixtureKey}): ${error.message}`);
  log("leave-request", fixtureKey, "created", data.id);
  return data.id;
}

// ============================================================================
// Phase G — Worked Hours.
// ============================================================================
const WORKED_HOURS_CATEGORIES = ["regular", "overtime", "night", "travel", "other"] as const;
type HoursByCategory = Partial<Record<(typeof WORKED_HOURS_CATEGORIES)[number], number>>;

async function ensureWorkedHours(
  managerSession: Awaited<ReturnType<typeof signInAs>>,
  companyId: string,
  projectId: string,
  employeeId: string,
  workDate: string,
  hours: HoursByCategory,
  label: string,
  submit = true,
): Promise<string | null> {
  const { data: existing } = await managerSession.from("worked_hours").select("id, status").eq("company_id", companyId).eq("project_id", projectId).eq("employee_id", employeeId).eq("work_date", workDate).maybeSingle();
  if (existing) {
    log("worked-hours", `${label} (${workDate})`, "reused", existing.status);
    return existing.id;
  }
  const categories = WORKED_HOURS_CATEGORIES.map((category) => ({ category, hours: hours[category] ?? 0 }));
  const { data, error } = await managerSession.rpc("upsert_worked_hours_categories", { target_project_id: projectId, target_employee_id: employeeId, target_work_date: workDate, target_categories: categories, target_note: undefined, target_reason: undefined }).single();
  if (error) throw new Error(`upsert_worked_hours_categories (${label}, ${workDate}): ${error.message}`);
  const id = (data as { id: string }).id;
  log("worked-hours", `${label} (${workDate})`, "created", id);
  if (submit) {
    const { error: submitErr } = await managerSession.rpc("submit_worked_hours", { target_project_id: projectId, target_work_date: workDate });
    if (submitErr) throw new Error(`submit_worked_hours (${workDate}): ${submitErr.message}`);
  }
  return id;
}

// ============================================================================
// Phase H — LMRA.
// ============================================================================
const LMRA_HAZARD_TYPES = [
  "working_at_height",
  "falling_objects",
  "line_of_fire",
  "manual_material_handling",
  "lifting_operations",
  "mobile_equipment_mewp",
  "weather_conditions",
  "access_egress",
  "housekeeping",
  "tools_equipment",
  "simultaneous_operations",
  "other",
] as const;

function buildLmraHazards(applicableTypes: (typeof LMRA_HAZARD_TYPES)[number][], responsiblePersonId: string) {
  return LMRA_HAZARD_TYPES.map((hazardType) => {
    const isApplicable = applicableTypes.includes(hazardType);
    return {
      hazard_type: hazardType,
      is_applicable: isApplicable,
      controls: isApplicable ? "TEST fixture: additional site-specific control noted by supervisor" : null,
      selected_controls: isApplicable ? ["TEST fixture control measure"] : [],
      responsible_person_id: isApplicable ? responsiblePersonId : null,
      controls_confirmed: isApplicable,
      other_description: hazardType === "other" && isApplicable ? "TEST fixture: other hazard noted" : null,
    };
  });
}

type LmraSpec = {
  key: string;
  session: Awaited<ReturnType<typeof signInAs>>;
  companyId: string;
  projectId: string;
  workArea: string;
  workActivity: string;
  workDate: string;
  shift: "day" | "night" | "late";
  completedByEmployeeId: string;
  responsiblePersonId: string;
  participantEmployeeIds: string[];
  dailyTeamId: string | null;
  result: "go" | "no_go";
  stopWorkReason?: string;
};

async function ensureLmra(spec: LmraSpec): Promise<string> {
  const { data: existing } = await spec.session.from("lmra_assessments").select("id, status").eq("company_id", spec.companyId).eq("project_id", spec.projectId).eq("work_area", spec.workArea).eq("work_date", spec.workDate).eq("shift", spec.shift).maybeSingle();
  if (existing) {
    log("lmra", spec.key, "reused", existing.status);
    return existing.id;
  }
  const hazards = buildLmraHazards(spec.result === "no_go" ? ["working_at_height", "line_of_fire", "weather_conditions"] : ["working_at_height", "tools_equipment"], spec.responsiblePersonId);
  const { data, error } = await spec.session
    .rpc("create_lmra_assessment", {
      target_company_id: spec.companyId,
      target_project_id: spec.projectId,
      target_work_area: spec.workArea,
      target_work_activity: spec.workActivity,
      target_work_date: spec.workDate,
      target_shift: spec.shift,
      target_completed_by_employee_id: spec.completedByEmployeeId,
      target_responsible_person_id: spec.responsiblePersonId,
      target_notes: "TEST fixture LMRA — role-validation realistic data seed.",
      target_participant_employee_ids: spec.participantEmployeeIds,
      target_hazards: hazards,
      target_submit: true,
      target_result: spec.result,
      target_stop_work_reason: spec.result === "no_go" ? (spec.stopWorkReason ?? "TEST fixture: stop-work condition identified") : undefined,
      target_daily_team_id: spec.dailyTeamId ?? undefined,
    })
    .single();
  if (error || !data) throw new Error(`create_lmra_assessment (${spec.key}): ${error?.message}`);
  const id = (data as { id: string }).id;
  log("lmra", spec.key, "created", id);
  return id;
}

// ============================================================================
// Phase I — Scaffolds + Inspections.
// ============================================================================
const SCAFFOLD_INSPECTION_ITEM_TYPES = [
  "foundation_sole_boards",
  "base_plates_adjustable_bases",
  "standards",
  "ledgers",
  "transoms",
  "bracing",
  "ties_anchors",
  "platforms_decking",
  "guardrails",
  "midrails",
  "toe_boards",
  "access_ladders_stairways",
  "access_gates",
  "loading_bays",
  "sheet_netting_condition",
  "falling_object_controls",
  "scaffold_tag_signage",
  "housekeeping",
  "maximum_load_information",
  "electrical_clearance",
  "vehicle_mobile_equipment_protection",
  "unauthorized_alterations",
  "overall_stability",
  "other_identified_issue",
] as const;

type ScaffoldSpec = {
  session: Awaited<ReturnType<typeof signInAs>>;
  /** scaffolds_update RLS is HSEQ-tier only (hseq_manager, or hse_officer/inspector with project access) — company_admin/PM can CREATE but not later UPDATE a scaffold row. Needed only for the erected_at self-heal below. */
  manageSession: Awaited<ReturnType<typeof signInAs>>;
  companyId: string;
  projectId: string;
  tagNumber: string;
  workArea: string;
  scaffoldType: Database["public"]["Enums"]["scaffold_type"];
  responsibleForemanId: string;
  erectedAtDaysAgo: number;
  erectionTeamId: string;
  /** Inspection frequency override (Parts O-Q) — defaults to no override (inherits the project's effective default, which itself falls through to the system default of seven_days/7 since neither this fixture company nor project sets one). */
  intervalType?: Database["public"]["Enums"]["scaffold_inspection_interval_type"];
  intervalDays?: number;
  /** Scaffold Map coordinates (Part U) — omitted entirely means "Location not set", matching a real never-configured scaffold. */
  latitude?: number;
  longitude?: number;
  /** Part 4/36/46 — omitted means "Not set" (a historical-shaped record), matching a real pre-Client-field scaffold. */
  clientName?: string;
};

async function ensureScaffold(spec: ScaffoldSpec): Promise<string> {
  const { data: existing } = await spec.session.from("scaffolds").select("id, erected_at").eq("company_id", spec.companyId).eq("project_id", spec.projectId).eq("tag_number", spec.tagNumber).maybeSingle();
  let scaffoldId: string;
  if (existing) {
    log("scaffold", spec.tagNumber, "reused", existing.id);
    scaffoldId = existing.id;
    // A row from an earlier iteration of this script may have a stale
    // erected_at that no longer matches the daily_team we're about to
    // link (scaffold_erection_teams requires an exact date match) —
    // self-heal it rather than fail forever on every re-run.
    if (existing.erected_at !== isoDate(spec.erectedAtDaysAgo)) {
      const { error: fixErr, count } = await spec.manageSession.from("scaffolds").update({ erected_at: isoDate(spec.erectedAtDaysAgo) }, { count: "exact" }).eq("id", existing.id);
      if (fixErr) throw new Error(`scaffolds erected_at self-heal (${spec.tagNumber}): ${fixErr.message}`);
      if (count === 0) throw new Error(`scaffolds erected_at self-heal (${spec.tagNumber}): matched 0 rows — manageSession lacks scaffolds_update access`);
      log("scaffold", spec.tagNumber, "updated", `erected_at corrected to ${isoDate(spec.erectedAtDaysAgo)}`);
    }
    // Idempotent self-heal for the frequency/location fixture additions too.
    const { error: fixErr2 } = await spec.manageSession
      .from("scaffolds")
      .update({
        inspection_interval_type: spec.intervalType ?? null,
        inspection_interval_days: spec.intervalDays ?? null,
        latitude: spec.latitude ?? null,
        longitude: spec.longitude ?? null,
        client_name: spec.clientName ?? null,
      })
      .eq("id", existing.id);
    if (fixErr2) throw new Error(`scaffolds interval/location self-heal (${spec.tagNumber}): ${fixErr2.message}`);
  } else {
    const { data, error } = await spec.session
      .from("scaffolds")
      .insert({
        company_id: spec.companyId,
        project_id: spec.projectId,
        tag_number: spec.tagNumber,
        client_name: spec.clientName ?? null,
        work_area: spec.workArea,
        structure_reference: `TEST-REF-${spec.tagNumber}`,
        scaffold_type: spec.scaffoldType,
        intended_use: "General access and light duty work",
        max_load_class: "Light Duty (2.0 kN/m2)",
        height_metres: 6.5,
        length_metres: 12,
        width_metres: 1.5,
        erected_by: "TEST Fixture Erection Crew",
        responsible_foreman_id: spec.responsibleForemanId,
        erected_at: isoDate(spec.erectedAtDaysAgo),
        notes: "TEST fixture scaffold — role-validation realistic data seed.",
        inspection_interval_type: spec.intervalType ?? null,
        inspection_interval_days: spec.intervalDays ?? null,
        latitude: spec.latitude ?? null,
        longitude: spec.longitude ?? null,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`scaffolds insert (${spec.tagNumber}): ${error?.message}`);
    log("scaffold", spec.tagNumber, "created", data.id);
    scaffoldId = data.id;
  }

  const { data: existingTeamLink } = await spec.session.from("scaffold_erection_teams").select("id").eq("scaffold_id", scaffoldId).eq("daily_team_id", spec.erectionTeamId).maybeSingle();
  if (existingTeamLink) {
    log("scaffold-erection-team", spec.tagNumber, "reused");
  } else {
    const { error: teamErr } = await spec.session.from("scaffold_erection_teams").insert({ company_id: spec.companyId, project_id: spec.projectId, scaffold_id: scaffoldId, daily_team_id: spec.erectionTeamId });
    if (teamErr) throw new Error(`scaffold_erection_teams insert (${spec.tagNumber}): ${teamErr.message}`);
    log("scaffold-erection-team", spec.tagNumber, "created");
  }

  return scaffoldId;
}

type ScaffoldParticipantSpec = {
  session: Awaited<ReturnType<typeof signInAs>>;
  companyId: string;
  projectId: string;
  scaffoldId: string;
  scaffoldTag: string;
  employeeId: string;
  workDate: string;
  source: "manual" | "team_import";
  sourceDailyTeamId?: string;
};

/**
 * Part 17 fixture — an actual `scaffold_erection_participants` row
 * (Parts 3-5's new authoritative crew model). The active-unique index is
 * per-scaffold, not global, so re-running this for the same employee on a
 * DIFFERENT scaffold/same date is expected and is exactly Part 13's
 * multi-scaffold-per-day fixture requirement, not a conflict.
 */
async function ensureScaffoldParticipant(spec: ScaffoldParticipantSpec): Promise<void> {
  const { data: existing } = await spec.session
    .from("scaffold_erection_participants")
    .select("id")
    .eq("scaffold_id", spec.scaffoldId)
    .eq("employee_id", spec.employeeId)
    .is("removed_at", null)
    .maybeSingle();
  if (existing) {
    log("scaffold-participant", spec.scaffoldTag, "reused", spec.employeeId);
    return;
  }
  const { error } = await spec.session.from("scaffold_erection_participants").insert({
    company_id: spec.companyId,
    project_id: spec.projectId,
    scaffold_id: spec.scaffoldId,
    employee_id: spec.employeeId,
    work_date: spec.workDate,
    source: spec.source,
    source_daily_team_id: spec.sourceDailyTeamId ?? null,
  });
  if (error) throw new Error(`scaffold_erection_participants insert (${spec.scaffoldTag}): ${error.message}`);
  log("scaffold-participant", spec.scaffoldTag, "created", `${spec.employeeId} (${spec.source})`);
}

type InspectionSpec = {
  session: Awaited<ReturnType<typeof signInAs>>;
  companyId: string;
  projectId: string;
  scaffoldId: string;
  scaffoldTag: string;
  inspectorId: string;
  inspectedAtDaysAgo: number;
  reason: Database["public"]["Enums"]["scaffold_inspection_reason"];
  outcome: Database["public"]["Enums"]["scaffold_inspection_outcome"];
  defectItemTypes?: (typeof SCAFFOLD_INSPECTION_ITEM_TYPES)[number][];
};

async function ensureInspection(spec: InspectionSpec): Promise<string> {
  const inspectedAtIso = new Date(`${isoDate(spec.inspectedAtDaysAgo)}T09:00:00Z`).toISOString();
  // .limit(1) + array check, NOT .maybeSingle() — .maybeSingle() errors
  // (and silently yields data: null, since only `data` was destructured)
  // if MORE THAN ONE row already matches, which is exactly the case for
  // any tag this bug already duplicated — that error was going
  // unnoticed and being misread as "not found", inserting yet another
  // duplicate on every single re-run.
  const { data: existingRows, error: existingErr } = await spec.session.from("scaffold_inspections").select("id, status").eq("company_id", spec.companyId).eq("scaffold_id", spec.scaffoldId).eq("inspected_at", inspectedAtIso).order("created_at", { ascending: true }).limit(1);
  if (existingErr) throw new Error(`scaffold_inspections existence check (${spec.scaffoldTag}): ${existingErr.message}`);
  if (existingRows && existingRows.length > 0) {
    log("scaffold-inspection", `${spec.scaffoldTag} (${isoDate(spec.inspectedAtDaysAgo)})`, "reused", existingRows[0].status);
    return existingRows[0].id;
  }
  // The exact-date match above can miss on a re-run days later (today's
  // relative "N days ago" now resolves to a different absolute date than
  // the row an earlier run created) — for a scaffold this fixture set
  // deliberately closes (outcome: closed_dismantled), the closed-scaffold
  // guard in validate_scaffold_inspection_insert() would then correctly
  // reject a second closing inspection. Idempotency for THIS case means
  // "the scaffold is already closed", not "an inspection exists on this
  // exact date" — fall back to that check before attempting the insert.
  if (spec.outcome === "closed_dismantled") {
    const { data: scaffoldRow } = await spec.session.from("scaffolds").select("status").eq("id", spec.scaffoldId).single();
    if (scaffoldRow?.status === "closed") {
      const { data: latestRows } = await spec.session.from("scaffold_inspections").select("id").eq("scaffold_id", spec.scaffoldId).order("created_at", { ascending: false }).limit(1);
      if (latestRows && latestRows.length > 0) {
        log("scaffold-inspection", `${spec.scaffoldTag}`, "reused", "already closed_dismantled");
        return latestRows[0].id;
      }
    }
  }
  const { data, error } = await spec.session
    .from("scaffold_inspections")
    .insert({
      company_id: spec.companyId,
      scaffold_id: spec.scaffoldId,
      project_id: spec.projectId,
      inspection_reason: spec.reason,
      inspector_id: spec.inspectorId,
      inspected_at: inspectedAtIso,
      notes: "TEST fixture inspection — role-validation realistic data seed.",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`scaffold_inspections insert (${spec.scaffoldTag}): ${error?.message}`);
  const inspectionId = data.id;
  log("scaffold-inspection", `${spec.scaffoldTag} (${isoDate(spec.inspectedAtDaysAgo)})`, "created", inspectionId);

  const items = SCAFFOLD_INSPECTION_ITEM_TYPES.map((itemType) => {
    const isDefect = spec.defectItemTypes?.includes(itemType) ?? false;
    return {
      item_type: itemType,
      result: isDefect ? "defect_found" : "acceptable",
      comment: isDefect ? "TEST fixture: defect noted during inspection" : null,
      required_corrective_action: isDefect ? "TEST fixture: repair/replace before further use" : null,
      severity: isDefect ? "medium" : null,
    };
  });
  const { error: itemsErr } = await spec.session.rpc("save_scaffold_inspection_items", { target_inspection_id: inspectionId, target_items: items });
  if (itemsErr) throw new Error(`save_scaffold_inspection_items (${spec.scaffoldTag}): ${itemsErr.message}`);

  const { error: finalizeErr } = await spec.session.rpc("finalize_scaffold_inspection", {
    target_inspection_id: inspectionId,
    target_outcome: spec.outcome,
    target_restrictions_notes: spec.outcome !== "safe_for_use" ? "TEST fixture: see checklist for restriction details" : undefined,
  });
  if (finalizeErr) throw new Error(`finalize_scaffold_inspection (${spec.scaffoldTag}): ${finalizeErr.message}`);
  log("scaffold-inspection-finalize", `${spec.scaffoldTag} (${isoDate(spec.inspectedAtDaysAgo)})`, "updated", spec.outcome);

  return inspectionId;
}

// ============================================================================
// Phase J — Safety Observations + Corrective Actions.
// ============================================================================
type ObservationSpec = {
  session: Awaited<ReturnType<typeof signInAs>>;
  companyId: string;
  projectId: string;
  workArea: string;
  observedAtDaysAgo: number;
  observerId: string;
  category: Database["public"]["Enums"]["observation_category"];
  description: string;
  riskLevel: Database["public"]["Enums"]["observation_risk_level"];
  isStopWork: boolean;
  observationType: Database["public"]["Enums"]["observation_type"];
  targetType: Database["public"]["Enums"]["observation_target_type"];
  targetEmployeeId?: string;
  targetDailyTeamId?: string;
  disposition?: Database["public"]["Enums"]["observation_negative_disposition"];
};

async function ensureObservation(spec: ObservationSpec): Promise<string> {
  const { data: existingRows } = await spec.session.from("safety_observations").select("id").eq("company_id", spec.companyId).eq("project_id", spec.projectId).eq("work_area", spec.workArea).eq("description", spec.description).limit(1);
  if (existingRows && existingRows.length > 0) {
    log("observation", spec.description.slice(0, 40), "reused");
    return existingRows[0].id;
  }
  const { data, error } = await spec.session
    .from("safety_observations")
    .insert({
      company_id: spec.companyId,
      project_id: spec.projectId,
      work_area: spec.workArea,
      observed_at: new Date(`${isoDate(spec.observedAtDaysAgo)}T10:00:00Z`).toISOString(),
      observer_id: spec.observerId,
      category: spec.category,
      description: spec.description,
      risk_level: spec.riskLevel,
      is_stop_work: spec.isStopWork,
      observation_type: spec.observationType,
      target_type: spec.targetType,
      target_employee_id: spec.targetEmployeeId ?? null,
      target_daily_team_id: spec.targetDailyTeamId ?? null,
      disposition: spec.disposition ?? null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`safety_observations insert (${spec.description.slice(0, 40)}): ${error?.message}`);
  log("observation", spec.description.slice(0, 40), "created", data.id);
  return data.id;
}

type CorrectiveActionSpec = {
  session: Awaited<ReturnType<typeof signInAs>>;
  companyId: string;
  projectId: string;
  observationId: string;
  description: string;
  responsiblePersonId: string;
  priority: Database["public"]["Enums"]["corrective_action_priority"];
  dueInDays: number;
  finalStatus: "open" | "in_progress" | "awaiting_verification" | "closed" | "rejected";
};

async function ensureCorrectiveAction(spec: CorrectiveActionSpec): Promise<string> {
  const { data: existingRows } = await spec.session.from("corrective_actions").select("id, status").eq("company_id", spec.companyId).eq("observation_id", spec.observationId).eq("description", spec.description).limit(1);
  if (existingRows && existingRows.length > 0) {
    log("corrective-action", spec.description.slice(0, 40), "reused", existingRows[0].status);
    return existingRows[0].id;
  }
  const { data, error } = await spec.session
    .from("corrective_actions")
    .insert({
      company_id: spec.companyId,
      observation_id: spec.observationId,
      project_id: spec.projectId,
      description: spec.description,
      responsible_person_id: spec.responsiblePersonId,
      priority: spec.priority,
      due_date: isoDate(-spec.dueInDays),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`corrective_actions insert (${spec.description.slice(0, 40)}): ${error?.message}`);
  const id = data.id;
  log("corrective-action", spec.description.slice(0, 40), "created", id);

  if (spec.finalStatus === "in_progress" || spec.finalStatus === "awaiting_verification" || spec.finalStatus === "closed" || spec.finalStatus === "rejected") {
    const { error: progressErr } = await spec.session.from("corrective_actions").update({ status: "in_progress", completion_notes: "TEST fixture: work started" }).eq("id", id).eq("status", "open");
    if (progressErr) throw new Error(`corrective_actions progress (${spec.description.slice(0, 40)}): ${progressErr.message}`);
  }
  if (spec.finalStatus === "awaiting_verification" || spec.finalStatus === "closed" || spec.finalStatus === "rejected") {
    const { error: awaitingErr } = await spec.session.from("corrective_actions").update({ status: "awaiting_verification", completion_notes: "TEST fixture: work completed, awaiting sign-off" }).eq("id", id).eq("status", "in_progress");
    if (awaitingErr) throw new Error(`corrective_actions awaiting-verification (${spec.description.slice(0, 40)}): ${awaitingErr.message}`);
  }
  if (spec.finalStatus === "closed") {
    const { error: closeErr } = await spec.session.from("corrective_actions").update({ status: "closed", closure_evidence: "TEST fixture: verified closed" }).eq("id", id).eq("status", "awaiting_verification");
    if (closeErr) throw new Error(`corrective_actions close (${spec.description.slice(0, 40)}): ${closeErr.message}`);
  }
  if (spec.finalStatus === "rejected") {
    const { error: rejectErr } = await spec.session.from("corrective_actions").update({ status: "rejected", reopen_reason: "TEST fixture: evidence insufficient, more work required" }).eq("id", id).eq("status", "awaiting_verification");
    if (rejectErr) throw new Error(`corrective_actions reject (${spec.description.slice(0, 40)}): ${rejectErr.message}`);
  }
  log("corrective-action-lifecycle", spec.description.slice(0, 40), "updated", spec.finalStatus);

  return id;
}

// ============================================================================
// Phase K — Toolbox Meetings + Templates + Safety Flash. Real PDF upload
// to the toolbox-documents bucket (path convention + validation mirrors
// lib/storage/toolbox-documents.ts exactly, since that file's helpers are
// plain app-internal functions, not RPCs this script can call directly) —
// a minimal but genuinely valid PDF (correct magic bytes), never junk
// bytes, and never a large binary committed to git (generated in-memory
// each run, nothing written to the repo).
// ============================================================================
function buildMinimalPdfBuffer(label: string): Buffer {
  const content = `%PDF-1.4\n% TEST fixture document — role-validation realistic data seed.\n% ${label}\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`;
  return Buffer.from(content, "latin1");
}

async function uploadFixturePdf(session: Awaited<ReturnType<typeof signInAs>>, objectPath: string, label: string): Promise<{ checksum: string; size: number }> {
  const buffer = buildMinimalPdfBuffer(label);
  const { error } = await session.storage.from("toolbox-documents").upload(objectPath, buffer, { contentType: "application/pdf", upsert: false });
  if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(`storage upload (${objectPath}): ${error.message}`);
  return { checksum: createHash("sha256").update(buffer).digest("hex"), size: buffer.byteLength };
}

function sanitizeFilenameSegment(name: string): string {
  return name.replace(/[^a-zA-Z0-9.-]/g, "_");
}

type ToolboxMeetingSpec = {
  session: Awaited<ReturnType<typeof signInAs>>;
  companyId: string;
  projectId: string;
  title: string;
  meetingDate: string;
  workArea: string;
  heldByEmployeeId: string;
  uploadedByUserId: string;
};

async function ensureToolboxMeeting(spec: ToolboxMeetingSpec): Promise<string> {
  const { data: existingRows } = await spec.session.from("toolbox_meetings").select("id").eq("company_id", spec.companyId).eq("project_id", spec.projectId).eq("title", spec.title).eq("meeting_date", spec.meetingDate).limit(1);
  if (existingRows && existingRows.length > 0) {
    log("toolbox-meeting", spec.title, "reused");
    return existingRows[0].id;
  }
  const meetingId = crypto.randomUUID();
  const filename = `${sanitizeFilenameSegment(spec.title)}.pdf`;
  const objectPath = `${spec.companyId}/meetings/${spec.projectId}/${meetingId}/${crypto.randomUUID()}-${filename}`;
  const { checksum, size } = await uploadFixturePdf(spec.session, objectPath, spec.title);
  const { data, error } = await spec.session
    .from("toolbox_meetings")
    .insert({
      id: meetingId,
      company_id: spec.companyId,
      project_id: spec.projectId,
      title: spec.title,
      meeting_date: spec.meetingDate,
      work_area: spec.workArea,
      held_by_employee_id: spec.heldByEmployeeId,
      uploaded_by: spec.uploadedByUserId,
      storage_bucket: "toolbox-documents",
      storage_object_path: objectPath,
      original_filename: filename,
      mime_type: "application/pdf",
      file_size_bytes: size,
      file_checksum_sha256: checksum,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`toolbox_meetings insert (${spec.title}): ${error?.message}`);
  log("toolbox-meeting", spec.title, "created", data.id);
  return data.id;
}

type ToolboxTemplateSpec = {
  session: Awaited<ReturnType<typeof signInAs>>;
  companyId: string;
  title: string;
  category: Database["public"]["Enums"]["hseq_document_category"];
  language: string;
  uploadedByUserId: string;
};

async function ensureToolboxTemplate(spec: ToolboxTemplateSpec): Promise<string> {
  const { data: existingRows } = await spec.session.from("toolbox_templates").select("id").eq("company_id", spec.companyId).eq("title", spec.title).limit(1);
  if (existingRows && existingRows.length > 0) {
    log("toolbox-template", spec.title, "reused");
    return existingRows[0].id;
  }
  const templateId = crypto.randomUUID();
  const filename = `${sanitizeFilenameSegment(spec.title)}.pdf`;
  const objectPath = `${spec.companyId}/templates/${templateId}/${crypto.randomUUID()}-${filename}`;
  const { checksum, size } = await uploadFixturePdf(spec.session, objectPath, spec.title);
  const { data, error } = await spec.session
    .from("toolbox_templates")
    .insert({
      id: templateId,
      company_id: spec.companyId,
      title: spec.title,
      category: spec.category,
      language: spec.language,
      uploaded_by: spec.uploadedByUserId,
      storage_bucket: "toolbox-documents",
      storage_object_path: objectPath,
      original_filename: filename,
      mime_type: "application/pdf",
      file_size_bytes: size,
      file_checksum_sha256: checksum,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`toolbox_templates insert (${spec.title}): ${error?.message}`);
  log("toolbox-template", spec.title, "created", data.id);
  return data.id;
}

type SafetyFlashSpec = {
  session: Awaited<ReturnType<typeof signInAs>>;
  companyId: string;
  projectId: string | null;
  title: string;
  dateIssued: string;
  category: Database["public"]["Enums"]["hseq_document_category"];
  issuedByEmployeeId: string;
  uploadedByUserId: string;
  status?: "active" | "archived";
  language?: string;
};

async function ensureSafetyFlash(spec: SafetyFlashSpec): Promise<string> {
  const { data: existingRows } = await spec.session.from("safety_flashes").select("id, status").eq("company_id", spec.companyId).eq("title", spec.title).limit(1);
  if (existingRows && existingRows.length > 0) {
    log("safety-flash", spec.title, "reused", existingRows[0].status);
    return existingRows[0].id;
  }
  const flashId = crypto.randomUUID();
  const filename = `${sanitizeFilenameSegment(spec.title)}.pdf`;
  const objectPath = `${spec.companyId}/safety-flash/${spec.projectId ?? "org"}/${flashId}/${crypto.randomUUID()}-${filename}`;
  const { checksum, size } = await uploadFixturePdf(spec.session, objectPath, spec.title);
  const { data, error } = await spec.session
    .from("safety_flashes")
    .insert({
      id: flashId,
      company_id: spec.companyId,
      project_id: spec.projectId,
      title: spec.title,
      date_issued: spec.dateIssued,
      category: spec.category,
      issued_by_employee_id: spec.issuedByEmployeeId,
      language: spec.language ?? "en",
      uploaded_by: spec.uploadedByUserId,
      storage_bucket: "toolbox-documents",
      storage_object_path: objectPath,
      original_filename: filename,
      mime_type: "application/pdf",
      file_size_bytes: size,
      file_checksum_sha256: checksum,
      summary: `TEST fixture safety flash — ${spec.title}.`,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`safety_flashes insert (${spec.title}): ${error?.message}`);
  log("safety-flash", spec.title, "created", data.id);
  if (spec.status === "archived") {
    const { error: archiveErr } = await spec.session.from("safety_flashes").update({ status: "archived" }).eq("id", data.id);
    if (archiveErr) throw new Error(`safety_flashes archive (${spec.title}): ${archiveErr.message}`);
    log("safety-flash", spec.title, "updated", "archived");
  }
  return data.id;
}

// ============================================================================
// Phase L — Equipment: catalog, issued items for Test Employee (all 4
// expiry states), and requests (pending/approved/fulfilled/denied).
// ============================================================================
type EquipmentItemSpec = {
  session: Awaited<ReturnType<typeof signInAs>>;
  companyId: string;
  projectId: string;
  trackingMode: "serialized" | "quantity";
  category: string;
  name: string;
  quantity?: number;
  defaultValidityDays?: number;
};

async function ensureEquipmentItem(spec: EquipmentItemSpec): Promise<string> {
  // reference_number must be filtered to the base/template row (null) —
  // ensureSerializedUnit() creates additional catalog rows sharing this
  // SAME name (different reference_number) for realism, and a bare
  // name-only lookup with no ORDER BY has no guaranteed row order, so it
  // could nondeterministically resolve to a serialized replica instead of
  // the base item, corrupting every caller that keys off this id.
  const { data: existingRows, error: existingErr } = await spec.session.from("equipment_items").select("id").eq("company_id", spec.companyId).eq("name", spec.name).is("reference_number", null).limit(1);
  if (existingErr) throw new Error(`equipment_items existence check (${spec.name}): ${existingErr.message}`);
  if (existingRows && existingRows.length > 0) {
    log("equipment-item", spec.name, "reused");
    return existingRows[0].id;
  }
  const { data, error } = await spec.session
    .rpc("create_equipment_item", {
      target_company_id: spec.companyId,
      target_project_id: spec.projectId,
      target_tracking_mode: spec.trackingMode,
      target_category: spec.category,
      target_name: spec.name,
      target_quantity: spec.trackingMode === "quantity" ? (spec.quantity ?? 10) : 1,
      target_condition: "new",
      target_default_validity_days: spec.defaultValidityDays,
    })
    .single();
  if (error || !data) throw new Error(`create_equipment_item (${spec.name}): ${error?.message}`);
  const id = (data as { id: string }).id;
  log("equipment-item", spec.name, "created", id);
  return id;
}

type SerializedUnitSpec = {
  session: Awaited<ReturnType<typeof signInAs>>;
  companyId: string;
  projectId: string;
  category: string;
  name: string;
  referenceNumber: string;
  condition?: Database["public"]["Enums"]["equipment_condition"];
  defaultValidityDays?: number;
  unitPrice?: number;
};

/**
 * Operational-realism pass — Part 25's "serialized item creation from a
 * catalog template" needs more than ONE physical unit per name to
 * actually demonstrate (ensureEquipmentItem's own existence check is
 * name-only, so a second call for the same name is always "reused" —
 * this is a genuinely different helper, keyed by (name, reference_number)
 * instead, exactly mirroring how the real "Add serialized item" dialog
 * duplicates a catalog template with its own serial number).
 */
async function ensureSerializedUnit(spec: SerializedUnitSpec): Promise<string> {
  const { data: existingRows } = await spec.session.from("equipment_items").select("id").eq("company_id", spec.companyId).eq("name", spec.name).eq("reference_number", spec.referenceNumber).limit(1);
  if (existingRows && existingRows.length > 0) {
    log("equipment-item-unit", `${spec.name} (${spec.referenceNumber})`, "reused");
    return existingRows[0].id;
  }
  const { data, error } = await spec.session
    .rpc("create_equipment_item", {
      target_company_id: spec.companyId,
      target_project_id: spec.projectId,
      target_tracking_mode: "serialized",
      target_category: spec.category,
      target_name: spec.name,
      target_reference_number: spec.referenceNumber,
      target_quantity: 1,
      target_condition: spec.condition ?? "new",
      target_default_validity_days: spec.defaultValidityDays,
      target_unit_price: spec.unitPrice,
      target_currency: spec.unitPrice !== undefined ? "EUR" : undefined,
    })
    .single();
  if (error || !data) throw new Error(`create_equipment_item (${spec.name} ${spec.referenceNumber}): ${error?.message}`);
  const id = (data as { id: string }).id;
  log("equipment-item-unit", `${spec.name} (${spec.referenceNumber})`, "created", id);
  return id;
}

async function main() {
  assertSeedAllowed();
  console.log(`=== Role-Validation REALISTIC DATA Seed — ${new Date().toISOString()} ===\n`);

  const { companyId, projectId, employeeIdByEmail } = await resolveCoreFixtures();
  console.log(`Company: ${companyId}\nProject: ${projectId}\n`);

  // Closure fix — test.foreman is Team Alpha's foreman (test.employee's own
  // team); a real phone number here is what makes the Foreman contact row
  // actually demonstrable end to end.
  await ensureFixturePhone("test.foreman@example.test", "+46701234567");

  const { data: staticTeam, error: staticTeamErr } = await admin.from("teams").select("id").eq("project_id", projectId).eq("name", "TEST Static Team").maybeSingle();
  if (staticTeamErr) throw staticTeamErr;
  if (!staticTeam) throw new Error('"TEST Static Team" not found — run seed-role-validation-fixtures.ts first.');
  const staticTeamId = staticTeam.id;

  // --- Phase B: supporting accounts (3 extra foremen, 1 extra employee, 1 suspended member) ---
  const supportingEmployeeIdByRole: Record<string, string> = {};
  for (const account of SUPPORTING_ACCOUNTS) {
    const userId = await ensureSupportingAuthUser(account.email, account.password, account.fullName);
    await waitForProfile(userId);
    const isSuspendedFixture = account.email === "test.suspendedworker@example.test";
    const membershipId = await ensureMembership(companyId, userId, account.email, isSuspendedFixture ? "suspended" : "active");
    await ensureExactMembershipRole(companyId, membershipId, account.roleName, account.email);
    const employeeId = await ensureEmployeeForAuthUser(companyId, userId, account.fullName, account.firstName, account.lastName, account.positionTitle, account.email);
    supportingEmployeeIdByRole[account.email] = employeeId;
    if (account.roleName === "foreman") {
      await ensureProjectAssignment(companyId, projectId, employeeId, "member", account.fullName);
      await ensureTeamAssignmentForeman(companyId, projectId, staticTeamId, employeeId, account.fullName);
    } else if (account.roleName === "employee" && !isSuspendedFixture) {
      // test.employee2 — an ordinary worker, project-assigned like any
      // other active employee (the suspended fixture deliberately gets
      // NO project assignment — a suspended membership shouldn't be
      // rostered at all).
      await ensureProjectAssignment(companyId, projectId, employeeId, "member", account.fullName);
    }
  }

  // --- Phase C: plain worker pool + onboarding-state examples ---
  const plainEmployeeIdByKey: Record<string, string> = {};
  for (const spec of PLAIN_WORKERS) {
    plainEmployeeIdByKey[spec.key] = await ensurePlainEmployee(companyId, spec);
  }
  // Only active workers get a project assignment — a terminated/offboarded
  // record or a not-yet-activated new hire realistically wouldn't have an
  // ACTIVE project assignment (would be an impossible/inconsistent fixture
  // state, which the task explicitly says to avoid).
  for (const spec of PLAIN_WORKERS) {
    if (spec.employmentStatus === "active" && spec.accountStatus === "active") {
      await ensureProjectAssignment(companyId, projectId, plainEmployeeIdByKey[spec.key], "member", `${spec.firstName} ${spec.lastName}`);
    }
  }

  // --- Phase D: secondary project (same company) ---
  const secondaryProjectId = await ensureSecondaryProject(companyId);

  // --- Phase D: isolation company B ---
  const { companyId: companyBId, projectId: projectBId } = await ensureIsolationCompanyB();
  const isolationBEmployeeIdByKey: Record<string, string> = {};
  for (const spec of ISOLATION_B_EMPLOYEES) {
    const workEmail = `fixture.${spec.key}@example.test`;
    const { data: existing } = await admin.from("employees").select("id").eq("company_id", companyBId).eq("work_email", workEmail).maybeSingle();
    if (existing) {
      log("isolation-b-employee", `${spec.firstName} ${spec.lastName}`, "reused", existing.id);
      isolationBEmployeeIdByKey[spec.key] = existing.id;
      continue;
    }
    const { data: employeeNumber, error: numErr } = await admin.rpc("allocate_employee_number", { target_org_id: companyBId });
    if (numErr || !employeeNumber) throw numErr ?? new Error("allocate_employee_number returned nothing");
    const { data, error } = await admin
      .from("employees")
      .insert({ company_id: companyBId, employee_number: employeeNumber, first_name: spec.firstName, last_name: spec.lastName, work_email: workEmail, position_title: spec.positionTitle, employment_status: "active", account_status: "active", start_date: isoDate(spec.startDaysAgo) })
      .select("id")
      .single();
    if (error) throw error;
    log("isolation-b-employee", `${spec.firstName} ${spec.lastName}`, "created", data.id);
    isolationBEmployeeIdByKey[spec.key] = data.id;
  }
  for (const key of Object.keys(isolationBEmployeeIdByKey)) {
    await admin.from("project_assignments").upsert(
      { company_id: companyBId, project_id: projectBId, employee_id: isolationBEmployeeIdByKey[key], assignment_role: "member" },
      { onConflict: "project_id,employee_id,assignment_role", ignoreDuplicates: true },
    );
  }

  // ==========================================================================
  // Phase E — Today's Teams (real RPCs, company_admin session)
  // ==========================================================================
  const companyAdminSession = await signInAs("test.companyadmin@example.test", STABLE_PASSWORDS.company_admin);

  // Operational-realism pass (Part 11 — Planner's "project physical
  // location") — a real site address + coordinates, matching the
  // scaffold coordinate cluster already used near Stockholm. projects_update
  // RLS permits company_admin directly (unlike country_code/timezone,
  // which needed the dedicated location-settings RPC).
  {
    const { data: existingProject } = await companyAdminSession.from("projects").select("site_address, site_latitude, site_longitude").eq("id", projectId).maybeSingle();
    if (existingProject?.site_address) {
      log("project-location", "TEST — Role Validation Project", "reused", existingProject.site_address);
    } else {
      const { error: locationErr } = await companyAdminSession.from("projects").update({ site_address: "Frihamnen Industrial Quay 12, 115 56 Stockholm, Sweden", site_latitude: 59.3346, site_longitude: 18.0975 }).eq("id", projectId);
      if (locationErr) throw new Error(`projects site location update: ${locationErr.message}`);
      log("project-location", "TEST — Role Validation Project", "created", "Frihamnen Industrial Quay 12, Stockholm");
    }
  }

  const employeeIdByKey: Record<string, string> = {
    employee: employeeIdByEmail.get("test.employee@example.test")!,
    employee2: supportingEmployeeIdByRole["test.employee2@example.test"],
    foreman: employeeIdByEmail.get("test.foreman@example.test")!,
    foreman2: supportingEmployeeIdByRole["test.foreman2@example.test"],
    foreman3: supportingEmployeeIdByRole["test.foreman3@example.test"],
    foreman4: supportingEmployeeIdByRole["test.foreman4@example.test"],
    ...Object.fromEntries(Object.entries(plainEmployeeIdByKey)),
  };

  const TEAM_SPECS: TeamSpec[] = [
    { key: "alpha", foremanEmail: "test.foreman@example.test", foremanEmployeeId: employeeIdByKey.foreman, name: "TEST Team Alpha", shift: "day", workArea: "North Platform", activity: "Scaffold erection", workerKeys: ["employee", "worker01", "worker02", "worker03", "worker04"] },
    { key: "bravo", foremanEmail: "test.foreman2@example.test", foremanEmployeeId: employeeIdByKey.foreman2, name: "TEST Team Bravo", shift: "day", workArea: "South Platform", activity: "Pipe insulation", workerKeys: ["worker05", "worker06", "worker07", "worker08"] },
    { key: "charlie", foremanEmail: "test.foreman3@example.test", foremanEmployeeId: employeeIdByKey.foreman3, name: "TEST Team Charlie", shift: "night", workArea: "Tank Farm", activity: "Electrical maintenance", workerKeys: ["worker09", "worker10", "worker11", "worker12"] },
    // Operational-realism pass — a 4th Friday team so the site "feels
    // busy" (task's "approximately 4-5 active teams" target), a 4th
    // Foreman, and a distinct work area/activity from the existing 3.
    { key: "delta", foremanEmail: "test.foreman4@example.test", foremanEmployeeId: employeeIdByKey.foreman4, name: "TEST Team Delta", shift: "day", workArea: "Pipe Rack A", activity: "Scaffold dismantling", workerKeys: ["worker13", "worker14", "worker15", "worker16"] },
  ];

  const todayTeamIds = await ensureDailyTeamsForDate(companyAdminSession, companyId, projectId, TODAY, TEAM_SPECS, employeeIdByKey);

  // ==========================================================================
  // Saturday 22 Aug 2026 (TOMORROW) — planned-in-advance teams, a smaller
  // workforce than Friday, proving future-roster changes: worker03 moves
  // from Alpha (Friday) to Bravo (Saturday), worker04 is left
  // deliberately unassigned. Alpha/Bravo/Charlie already existed from
  // earlier runs with Friday-sized rosters (ensureDailyTeamsForDate's
  // "reused" branch never re-runs its worker-assignment loop — see that
  // function's own comment) — this block explicitly reconciles Saturday's
  // ACTUAL composition afterward via the same idempotent move/remove
  // calls a real Foreman/PM would use, rather than relying on first-
  // creation-only rosters.
  // ==========================================================================
  const TOMORROW = isoDate(-1);
  const SATURDAY_TEAM_SPECS: TeamSpec[] = [
    { key: "alpha", foremanEmail: "test.foreman@example.test", foremanEmployeeId: employeeIdByKey.foreman, name: "TEST Team Alpha", shift: "day", workArea: "North Platform", activity: "Scaffold erection", workerKeys: ["employee", "worker01", "worker02"] },
    { key: "bravo", foremanEmail: "test.foreman2@example.test", foremanEmployeeId: employeeIdByKey.foreman2, name: "TEST Team Bravo", shift: "day", workArea: "South Platform", activity: "Pipe insulation", workerKeys: ["worker05", "worker06", "worker03"] },
    { key: "charlie", foremanEmail: "test.foreman3@example.test", foremanEmployeeId: employeeIdByKey.foreman3, name: "TEST Team Charlie", shift: "day", workArea: "Tank Farm", activity: "Electrical maintenance", workerKeys: ["worker09", "worker10", "employee2"] },
  ];
  const tomorrowTeamIds = await ensureDailyTeamsForDate(companyAdminSession, companyId, projectId, TOMORROW, SATURDAY_TEAM_SPECS, employeeIdByKey);

  // Reconcile Alpha-Saturday down to its intended 3-person crew (employee
  // + worker01 + worker02) even when the team row already existed from a
  // prior run with Friday's full 5-person roster.
  for (const key of ["employee", "worker01", "worker02"]) {
    const { error: moveErr } = await companyAdminSession.rpc("move_daily_team_member", { target_project_id: projectId, target_work_date: TOMORROW, target_daily_team_id: tomorrowTeamIds.alpha, target_employee_id: employeeIdByKey[key], target_role: "member" });
    if (moveErr && !moveErr.message.includes("pending leave/absence request")) throw new Error(`move_daily_team_member (Saturday Alpha reconcile, ${key}): ${moveErr.message}`);
  }
  // worker03 moves TO Bravo-Saturday (move_daily_team_member closes
  // whatever OTHER team row they held for this date first — this is the
  // literal "moved from one Foreman's team to another" fixture).
  const { error: moveWorker03Err } = await companyAdminSession.rpc("move_daily_team_member", { target_project_id: projectId, target_work_date: TOMORROW, target_daily_team_id: tomorrowTeamIds.bravo, target_employee_id: plainEmployeeIdByKey.worker03, target_role: "member" });
  if (moveWorker03Err && !moveWorker03Err.message.includes("pending leave/absence request")) throw new Error(`move_daily_team_member (worker03 -> Saturday Bravo): ${moveWorker03Err.message}`);
  log("daily-team-members", "worker03 moved Alpha(Fri) -> Bravo(Sat)", "updated");
  // worker04 is explicitly REMOVED from Alpha-Saturday (if a prior run
  // ever put them there) and never re-added anywhere — "intentionally
  // left available/unassigned" for Saturday. validate_daily_team_member_
  // update() requires removed_at/removed_by to be set together (the only
  // update it permits at all).
  const companyAdminUserId = (await companyAdminSession.auth.getUser()).data.user!.id;
  const { error: removeWorker04Err, count: removeWorker04Count } = await companyAdminSession
    .from("daily_team_members")
    .update({ removed_at: new Date().toISOString(), removed_by: companyAdminUserId }, { count: "exact" })
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .eq("work_date", TOMORROW)
    .eq("employee_id", plainEmployeeIdByKey.worker04)
    .is("removed_at", null);
  if (removeWorker04Err) throw new Error(`daily_team_members remove (worker04, Saturday): ${removeWorker04Err.message}`);
  log("daily-team-members", "worker04 left unassigned (Sat)", removeWorker04Count && removeWorker04Count > 0 ? "updated" : "reused", removeWorker04Count ? `${removeWorker04Count} removed` : "already unassigned");

  // ==========================================================================
  // Sunday 23 Aug 2026 — a genuinely reduced day: ONE small team (not a
  // full Friday-sized roster), only the workers actually scheduled.
  // ==========================================================================
  const SUNDAY = isoDate(-2);
  const SUNDAY_TEAM_SPECS: TeamSpec[] = [
    { key: "alpha", foremanEmail: "test.foreman@example.test", foremanEmployeeId: employeeIdByKey.foreman, name: "TEST Team Alpha", shift: "day", workArea: "North Platform", activity: "Weekend scaffold check", workerKeys: ["employee", "worker01"] },
  ];
  const sundayTeamIds = await ensureDailyTeamsForDate(companyAdminSession, companyId, projectId, SUNDAY, SUNDAY_TEAM_SPECS, employeeIdByKey);
  void sundayTeamIds;

  const HISTORICAL_DATES = [isoDate(1), isoDate(2), isoDate(9)]; // yesterday, 2 days ago, previous week
  for (const workDate of HISTORICAL_DATES) {
    const { data: existing } = await companyAdminSession.from("daily_teams").select("id").eq("company_id", companyId).eq("project_id", projectId).eq("work_date", workDate);
    if (existing && existing.length > 0) {
      log("daily-team-copy", workDate, "reused", `${existing.length} teams already exist`);
    } else {
      const { error: copyErr } = await companyAdminSession.rpc("copy_daily_teams_to_date", { target_project_id: projectId, target_source_work_date: TODAY, target_destination_work_date: workDate });
      if (copyErr) throw new Error(`copy_daily_teams_to_date(${workDate}): ${copyErr.message}`);
      log("daily-team-copy", workDate, "created", `copied from ${TODAY}`);
    }
    await lockDateIfOpen(companyAdminSession, projectId, workDate);
  }

  // ==========================================================================
  // Phase F — Attendance / Absence / Leave. Uses non-team-worker employees
  // (recruiter/planner/inspector/employee) for absence/leave scenarios so
  // nothing here disrupts the Today's Teams rosters just built — marking
  // someone unavailable auto-removes them from their team, so this is
  // deliberately never done to anyone on Alpha/Bravo/Charlie today.
  // ==========================================================================
  const recruiterEmployeeId = employeeIdByEmail.get("test.recruiter@example.test")!;
  const plannerEmployeeId = employeeIdByEmail.get("test.planner@example.test")!;
  const inspectorEmployeeId = employeeIdByEmail.get("test.inspector@example.test")!;
  const employeeEmployeeId = employeeIdByEmail.get("test.employee@example.test")!;

  const { data: existingAttendance } = await companyAdminSession.from("daily_attendance").select("id, status").eq("company_id", companyId).eq("project_id", projectId).eq("employee_id", recruiterEmployeeId).eq("work_date", TODAY).maybeSingle();
  if (existingAttendance) {
    log("attendance", `Test Recruiter (${TODAY})`, "reused", existingAttendance.status);
  } else {
    const { error } = await companyAdminSession.rpc("set_daily_attendance_status", { target_project_id: projectId, target_employee_id: recruiterEmployeeId, target_work_date: TODAY, target_status: "sick", target_note: undefined, target_reason: undefined });
    if (error) throw new Error(`set_daily_attendance_status (recruiter sick today): ${error.message}`);
    log("attendance", `Test Recruiter (${TODAY})`, "created", "sick");
  }

  // Part M (Inspectors Today) — test.inspector@example.test marked
  // present today, so the dashboard's "Inspectors Today" summary/list has
  // at least one real "At Work" example to smoke-test against. A full
  // three-way (At Work / Absent / Holiday) demonstration would need
  // multiple genuinely inspector-role accounts, which this fixture
  // company only has one of (test.inspector) — the underlying query
  // (get_inspectors_today) and its "not_set"/"absent"/"leave" branches
  // are exercised generically elsewhere in this file (e.g. the recruiter/
  // planner scenarios above use the same set_daily_attendance_status RPC),
  // just not against a second/third inspector-role identity.
  const { data: existingInspectorAttendance } = await companyAdminSession.from("daily_attendance").select("id, status").eq("company_id", companyId).eq("project_id", projectId).eq("employee_id", inspectorEmployeeId).eq("work_date", TODAY).maybeSingle();
  if (existingInspectorAttendance) {
    log("attendance", `Test Inspector (${TODAY})`, "reused", existingInspectorAttendance.status);
  } else {
    const { error } = await companyAdminSession.rpc("set_daily_attendance_status", { target_project_id: projectId, target_employee_id: inspectorEmployeeId, target_work_date: TODAY, target_status: "present", target_note: undefined, target_reason: undefined });
    if (error) throw new Error(`set_daily_attendance_status (inspector present today): ${error.message}`);
    log("attendance", `Test Inspector (${TODAY})`, "created", "present");
  }

  const plannerSession = await signInAs("test.planner@example.test", STABLE_PASSWORDS.planner);
  const plannerUser = await plannerSession.auth.getUser();
  const plannerLeaveId = await ensureLeaveRequest(plannerSession, companyId, projectId, plannerEmployeeId, plannerUser.data.user!.id, "annual", isoDate(5), isoDate(3), "TEST fixture: approved annual leave", "planner-approved-leave");
  if (plannerLeaveId) {
    const { data: current } = await companyAdminSession.from("leave_requests").select("status").eq("id", plannerLeaveId).single();
    if (current?.status === "pending") {
      const { error } = await companyAdminSession.rpc("approve_leave_request", { target_request_id: plannerLeaveId, target_comment: "Approved — TEST fixture" });
      if (error) throw new Error(`approve_leave_request (planner): ${error.message}`);
      log("leave-request", "planner-approved-leave", "updated", "approved");
    }
  }

  const employeeSession = await signInAs("test.employee@example.test", STABLE_PASSWORDS.employee);
  const employeeUser = await employeeSession.auth.getUser();
  await ensureLeaveRequest(employeeSession, companyId, projectId, employeeEmployeeId, employeeUser.data.user!.id, "annual", isoDate(-3), isoDate(-5), "TEST fixture: pending upcoming leave", "employee-pending-leave");

  const inspectorSession = await signInAs("test.inspector@example.test", STABLE_PASSWORDS.inspector);
  const inspectorUser = await inspectorSession.auth.getUser();
  const inspectorLeaveId = await ensureLeaveRequest(inspectorSession, companyId, projectId, inspectorEmployeeId, inspectorUser.data.user!.id, "unpaid", isoDate(15), isoDate(14), "TEST fixture: denied unpaid leave", "inspector-denied-leave");
  if (inspectorLeaveId) {
    const { data: current } = await companyAdminSession.from("leave_requests").select("status").eq("id", inspectorLeaveId).single();
    if (current?.status === "pending") {
      const { error } = await companyAdminSession.rpc("deny_leave_request", { target_request_id: inspectorLeaveId, target_comment: "Denied — TEST fixture, insufficient notice" });
      if (error) throw new Error(`deny_leave_request (inspector): ${error.message}`);
      log("leave-request", "inspector-denied-leave", "updated", "denied");
    }
  }

  // Self-reported absence + manager confirmation (Part 6's "correction/history where the model supports it").
  const { data: existingReport } = await companyAdminSession.from("absence_reports").select("id, status").eq("company_id", companyId).eq("project_id", projectId).eq("employee_id", employeeEmployeeId).eq("work_date", isoDate(3)).maybeSingle();
  if (existingReport) {
    log("absence-report", `Test Employee (${isoDate(3)})`, "reused", existingReport.status);
  } else {
    const { data: report, error: reportErr } = await employeeSession.rpc("report_absence", { target_project_id: projectId, target_employee_id: employeeEmployeeId, target_work_date: isoDate(3), target_reason: "sick", target_comment: "TEST fixture: felt unwell" }).single();
    if (reportErr) throw new Error(`report_absence: ${reportErr.message}`);
    log("absence-report", `Test Employee (${isoDate(3)})`, "created");
    // target_reason is passed unconditionally and harmlessly here: isoDate(N)
    // fixture dates drift by one real day on every calendar-day boundary, so
    // a date that used to be a "safe" isoDate(N) slot on an earlier run can
    // collide with already-submitted worked hours seeded on a later run —
    // this reason covers that case without needing to detect it in advance
    // (20260901108000_confirm_absence_report_reason.sql).
    const { error: confirmErr } = await companyAdminSession.rpc("confirm_absence_report", {
      target_report_id: (report as { id: string }).id,
      target_reason: "TEST fixture: confirming self-reported absence",
    });
    if (confirmErr) throw new Error(`confirm_absence_report: ${confirmErr.message}`);
    log("absence-report", `Test Employee (${isoDate(3)})`, "updated", "confirmed");
  }

  // ==========================================================================
  // Available/Unassigned workforce fixtures (Fri 21 / Sat 22 Aug 2026) —
  // plain workers have NO auth account and so structurally cannot self-
  // submit a leave_requests/absence_reports row (RLS requires
  // employee.profile_id = auth.uid()); these scenarios therefore use the
  // account-holding, non-management-only fixtures (recruiter/hse_officer/
  // hseq_manager/employee2) instead, exactly the same real self-service
  // paths every other request in this file already uses. "Confirmed
  // absent" and "available but unassigned" don't need a request at all —
  // set_daily_attendance_status is a manager action, callable directly
  // for any employee (worker17/worker18 included).
  // ==========================================================================
  const employee2EmployeeId = employeeIdByKey.employee2;
  const employee2Session = await signInAs("test.employee2@example.test", "TestEmployeeTwo2026!");
  const employee2User = await employee2Session.auth.getUser();

  // Approved holiday TODAY (Friday) for Test Employee Two — approved, and
  // attendance explicitly marked "leave" for the day so the Today's Teams
  // panel actually reflects it as Unavailable (attendanceStatus is its
  // own independent signal from the leave_requests table — approving a
  // request never auto-writes daily_attendance).
  const employee2LeaveId = await ensureLeaveRequest(employee2Session, companyId, projectId, employee2EmployeeId, employee2User.data.user!.id, "annual", TODAY, TODAY, "TEST fixture: approved single-day holiday", "employee2-approved-holiday-today");
  if (employee2LeaveId) {
    const { data: current } = await companyAdminSession.from("leave_requests").select("status").eq("id", employee2LeaveId).single();
    if (current?.status === "pending") {
      const { error } = await companyAdminSession.rpc("approve_leave_request", { target_request_id: employee2LeaveId, target_comment: "Approved — TEST fixture" });
      if (error) throw new Error(`approve_leave_request (employee2): ${error.message}`);
      log("leave-request", "employee2-approved-holiday-today", "updated", "approved");
    }
  }
  const { data: existingEmployee2Attendance } = await companyAdminSession.from("daily_attendance").select("id, status").eq("company_id", companyId).eq("project_id", projectId).eq("employee_id", employee2EmployeeId).eq("work_date", TODAY).maybeSingle();
  if (existingEmployee2Attendance) {
    log("attendance", `Test Employee Two (${TODAY})`, "reused", existingEmployee2Attendance.status);
  } else {
    const { error } = await companyAdminSession.rpc("set_daily_attendance_status", { target_project_id: projectId, target_employee_id: employee2EmployeeId, target_work_date: TODAY, target_status: "leave", target_note: undefined, target_reason: undefined });
    if (error) throw new Error(`set_daily_attendance_status (employee2 leave today): ${error.message}`);
    log("attendance", `Test Employee Two (${TODAY})`, "created", "leave");
  }

  // Pending holiday request covering BOTH Friday and Saturday — Test
  // Recruiter (a real, non-management-only account never assigned to a
  // team, so this exercises the panel without disturbing any roster).
  const recruiterSession = await signInAs("test.recruiter@example.test", STABLE_PASSWORDS.recruiter);
  const recruiterUser = await recruiterSession.auth.getUser();
  await ensureLeaveRequest(recruiterSession, companyId, projectId, recruiterEmployeeId, recruiterUser.data.user!.id, "annual", TODAY, TOMORROW, "TEST fixture: pending holiday covering the weekend", "recruiter-pending-holiday-weekend");

  // Pending absence request TODAY (Friday) — Test HSE Officer.
  const hseOfficerEmployeeIdForAvailability = employeeIdByEmail.get("test.hseofficer@example.test")!;
  const hseOfficerSessionForAvailability = await signInAs("test.hseofficer@example.test", STABLE_PASSWORDS.hse_officer);
  const { data: existingHseOfficerReport } = await companyAdminSession.from("absence_reports").select("id, status").eq("company_id", companyId).eq("project_id", projectId).eq("employee_id", hseOfficerEmployeeIdForAvailability).eq("work_date", TODAY).maybeSingle();
  if (existingHseOfficerReport) {
    log("absence-report", `Test HSE Officer (${TODAY})`, "reused", existingHseOfficerReport.status);
  } else {
    const { error: reportErr } = await hseOfficerSessionForAvailability.rpc("report_absence", { target_project_id: projectId, target_employee_id: hseOfficerEmployeeIdForAvailability, target_work_date: TODAY, target_reason: "other", target_comment: "TEST fixture: pending absence, awaiting review" });
    if (reportErr) throw new Error(`report_absence (hse officer, pending): ${reportErr.message}`);
    log("absence-report", `Test HSE Officer (${TODAY})`, "created", "pending");
  }

  // Pending absence request SATURDAY — Test HSE Manager (a different HSE
  // role, so both this weekend AND section 10's "HSE has real records"
  // requirement get distinct coverage).
  const hseqManagerEmployeeIdForAvailability = employeeIdByEmail.get("test.hseqmanager@example.test")!;
  const hseqManagerSessionForAvailability = await signInAs("test.hseqmanager@example.test", STABLE_PASSWORDS.hseq_manager);
  const { data: existingHseqManagerReport } = await companyAdminSession.from("absence_reports").select("id, status").eq("company_id", companyId).eq("project_id", projectId).eq("employee_id", hseqManagerEmployeeIdForAvailability).eq("work_date", TOMORROW).maybeSingle();
  if (existingHseqManagerReport) {
    log("absence-report", `Test HSE Manager (${TOMORROW})`, "reused", existingHseqManagerReport.status);
  } else {
    const { error: reportErr } = await hseqManagerSessionForAvailability.rpc("report_absence", { target_project_id: projectId, target_employee_id: hseqManagerEmployeeIdForAvailability, target_work_date: TOMORROW, target_reason: "other", target_comment: "TEST fixture: pending absence, awaiting review" });
    if (reportErr) throw new Error(`report_absence (hseq manager, pending): ${reportErr.message}`);
    log("absence-report", `Test HSE Manager (${TOMORROW})`, "created", "pending");
  }

  // Confirmed absent — worker17, Friday AND Saturday (a manager action,
  // set_daily_attendance_status never requires the target employee to
  // have a login).
  for (const workDate of [TODAY, TOMORROW]) {
    const { data: existingWorker17Attendance } = await companyAdminSession.from("daily_attendance").select("id, status").eq("company_id", companyId).eq("project_id", projectId).eq("employee_id", plainEmployeeIdByKey.worker17).eq("work_date", workDate).maybeSingle();
    if (existingWorker17Attendance) {
      log("attendance", `worker17 (${workDate})`, "reused", existingWorker17Attendance.status);
    } else {
      const { error } = await companyAdminSession.rpc("set_daily_attendance_status", { target_project_id: projectId, target_employee_id: plainEmployeeIdByKey.worker17, target_work_date: workDate, target_status: "absent", target_note: undefined, target_reason: undefined });
      if (error) throw new Error(`set_daily_attendance_status (worker17 absent, ${workDate}): ${error.message}`);
      log("attendance", `worker17 (${workDate})`, "created", "absent");
    }
  }
  // worker18 is deliberately left completely untouched here — active,
  // project-assigned, attendance not_set, on no team either day — the
  // "available but still unassigned" / "active worker with no team yet"
  // example for both Friday and Saturday.

  // ==========================================================================
  // Phase G — Worked Hours: rich history for test.employee (Today/This
  // Week/This Month all show something meaningful), lighter coverage for
  // teammates (populated manager dashboards), one correction, one resolved
  // discrepancy, one still-open discrepancy on a different worker.
  // ==========================================================================
  await ensureWorkedHours(companyAdminSession, companyId, projectId, employeeEmployeeId, TODAY, { regular: 8, overtime: 2 }, "Test Employee");
  await ensureWorkedHours(companyAdminSession, companyId, projectId, employeeEmployeeId, isoDate(1), { regular: 8 }, "Test Employee");
  await ensureWorkedHours(companyAdminSession, companyId, projectId, employeeEmployeeId, isoDate(2), { regular: 8 }, "Test Employee");
  // isoDate(3) deliberately skipped — Test Employee's confirmed absence fixture is on that exact date (Phase F); entering hours there would be a contradictory, "impossible" fixture state.
  await ensureWorkedHours(companyAdminSession, companyId, projectId, employeeEmployeeId, isoDate(4), { regular: 8 }, "Test Employee");
  await ensureWorkedHours(companyAdminSession, companyId, projectId, employeeEmployeeId, isoDate(9), { regular: 8 }, "Test Employee");
  await ensureWorkedHours(companyAdminSession, companyId, projectId, employeeEmployeeId, isoDate(10), { regular: 8 }, "Test Employee");
  await ensureWorkedHours(companyAdminSession, companyId, projectId, employeeEmployeeId, isoDate(20), { regular: 6, overtime: 1 }, "Test Employee");

  for (const key of ["worker01", "worker02", "worker03", "worker04"]) {
    await ensureWorkedHours(companyAdminSession, companyId, projectId, plainEmployeeIdByKey[key], TODAY, { regular: 8 }, key);
    await ensureWorkedHours(companyAdminSession, companyId, projectId, plainEmployeeIdByKey[key], isoDate(1), { regular: 8 }, key);
  }
  // Team Delta (Friday) — regular hours, and a small overtime example.
  await ensureWorkedHours(companyAdminSession, companyId, projectId, plainEmployeeIdByKey.worker13, TODAY, { regular: 8, overtime: 1 }, "worker13");
  await ensureWorkedHours(companyAdminSession, companyId, projectId, plainEmployeeIdByKey.worker14, TODAY, { regular: 8 }, "worker14");
  await ensureWorkedHours(companyAdminSession, companyId, projectId, plainEmployeeIdByKey.worker15, TODAY, { regular: 8 }, "worker15");
  // worker16 deliberately left WITHOUT Friday hours — Part 8's "some
  // workers missing hours" for the PM Daily Overview to show meaningfully.
  for (const key of ["worker05", "worker06", "worker07", "worker08", "worker10", "worker11", "worker12"]) {
    await ensureWorkedHours(companyAdminSession, companyId, projectId, plainEmployeeIdByKey[key], TODAY, { regular: 8 }, key);
  }
  // worker09 — Team Charlie is the night-shift team; a real Regular/Night
  // split (per the current Worked Hours categories) rather than a plain
  // 8h regular day, so the night-shift example is genuinely demonstrable.
  await ensureWorkedHours(companyAdminSession, companyId, projectId, plainEmployeeIdByKey.worker09, TODAY, { regular: 4, night: 4 }, "worker09 (night shift)");

  // Saturday 22 Aug — planned/current worked hours for the Saturday
  // roster (Part 3/13): Alpha (employee/worker01/worker02), Bravo
  // (worker05/worker06/worker03 — worker03 moved teams, matching hours
  // follow), Charlie (worker09/worker10/employee2).
  await ensureWorkedHours(companyAdminSession, companyId, projectId, employeeEmployeeId, TOMORROW, { regular: 8 }, "Test Employee");
  await ensureWorkedHours(companyAdminSession, companyId, projectId, plainEmployeeIdByKey.worker01, TOMORROW, { regular: 8 }, "worker01");
  await ensureWorkedHours(companyAdminSession, companyId, projectId, plainEmployeeIdByKey.worker02, TOMORROW, { regular: 8, overtime: 2 }, "worker02");
  await ensureWorkedHours(companyAdminSession, companyId, projectId, plainEmployeeIdByKey.worker05, TOMORROW, { regular: 8 }, "worker05");
  await ensureWorkedHours(companyAdminSession, companyId, projectId, plainEmployeeIdByKey.worker03, TOMORROW, { regular: 8 }, "worker03");
  await ensureWorkedHours(companyAdminSession, companyId, projectId, plainEmployeeIdByKey.worker09, TOMORROW, { regular: 6, overtime: 2 }, "worker09");
  // worker06/worker10/employee2 deliberately left WITHOUT Saturday hours
  // yet — a genuinely "planned but not yet worked" future day, not every
  // roster slot pre-filled.

  // Sunday 23 Aug — a reduced day; only the two workers actually
  // scheduled (Sunday Team Alpha) get hours, demonstrating the Sunday
  // premium on a short, realistic weekend shift.
  await ensureWorkedHours(companyAdminSession, companyId, projectId, employeeEmployeeId, SUNDAY, { regular: 6 }, "Test Employee (Sunday)");
  await ensureWorkedHours(companyAdminSession, companyId, projectId, plainEmployeeIdByKey.worker01, SUNDAY, { regular: 6 }, "worker01 (Sunday)");

  // One worked-hours correction — amend Test Employee's already-submitted
  // yesterday entry (upsert_worked_hours_categories requires a reason once
  // a day is already submitted; the RPC records it in worked_hours_corrections).
  const { data: existingCorrection } = await companyAdminSession.from("worked_hours_corrections").select("id").eq("company_id", companyId).limit(1);
  const { data: yesterdayRow } = await companyAdminSession.from("worked_hours").select("id").eq("company_id", companyId).eq("project_id", projectId).eq("employee_id", employeeEmployeeId).eq("work_date", isoDate(1)).single();
  const { data: yesterdayCorrections } = await companyAdminSession.from("worked_hours_corrections").select("id").eq("worked_hours_id", yesterdayRow!.id);
  if (yesterdayCorrections && yesterdayCorrections.length > 0) {
    log("worked-hours-correction", `Test Employee (${isoDate(1)})`, "reused");
  } else {
    const { error: correctionErr } = await companyAdminSession.rpc("upsert_worked_hours_categories", {
      target_project_id: projectId,
      target_employee_id: employeeEmployeeId,
      target_work_date: isoDate(1),
      target_categories: [
        { category: "regular", hours: 7 },
        { category: "overtime", hours: 0 },
        { category: "night", hours: 0 },
        { category: "travel", hours: 1 },
        { category: "other", hours: 0 },
      ],
      target_note: undefined,
      target_reason: "TEST fixture correction: 1h site travel time was originally missed",
    });
    if (correctionErr) throw new Error(`worked-hours correction: ${correctionErr.message}`);
    log("worked-hours-correction", `Test Employee (${isoDate(1)})`, "created");
  }
  void existingCorrection;

  // Resolved discrepancy — Test Employee reports one on TODAY's entry, company_admin accepts it.
  const { data: todayRow } = await companyAdminSession.from("worked_hours").select("id").eq("company_id", companyId).eq("project_id", projectId).eq("employee_id", employeeEmployeeId).eq("work_date", TODAY).single();
  const { data: existingDiscrepancy } = await companyAdminSession.from("worked_hours_discrepancies").select("id, status").eq("worked_hours_id", todayRow!.id).maybeSingle();
  if (existingDiscrepancy) {
    log("worked-hours-discrepancy", `Test Employee (${TODAY})`, "reused", existingDiscrepancy.status);
  } else {
    const { data: discrepancy, error: reportErr } = await employeeSession.rpc("report_worked_hours_discrepancy", { target_worked_hours_id: todayRow!.id, target_comment: "TEST fixture: overtime should be 3h, not 2h" }).single();
    if (reportErr) throw new Error(`report_worked_hours_discrepancy (today): ${reportErr.message}`);
    log("worked-hours-discrepancy", `Test Employee (${TODAY})`, "created");
    const { error: resolveErr } = await companyAdminSession.rpc("resolve_worked_hours_discrepancy", { target_discrepancy_id: (discrepancy as { id: string }).id, target_status: "accepted", target_resolution_note: "TEST fixture: confirmed with foreman, corrected", target_resulting_hours: 11 });
    if (resolveErr) throw new Error(`resolve_worked_hours_discrepancy (today): ${resolveErr.message}`);
    log("worked-hours-discrepancy", `Test Employee (${TODAY})`, "updated", "resolved (accepted)");
  }

  // Still-open (in-review) discrepancy on a DIFFERENT worker. Reporting is
  // employee self-service only (RLS confirms the caller owns the
  // referenced worked_hours row) — worker02 has no auth account, so this
  // uses test.foreman (a real signed-in fixture account) instead.
  const foremanEmployeeId2 = employeeIdByEmail.get("test.foreman@example.test")!;
  await ensureWorkedHours(companyAdminSession, companyId, projectId, foremanEmployeeId2, TODAY, { regular: 8 }, "Test Foreman");
  const { data: foremanRow } = await companyAdminSession.from("worked_hours").select("id").eq("company_id", companyId).eq("project_id", projectId).eq("employee_id", foremanEmployeeId2).eq("work_date", TODAY).single();
  const { data: existingForemanDiscrepancy } = await companyAdminSession.from("worked_hours_discrepancies").select("id, status").eq("worked_hours_id", foremanRow!.id).maybeSingle();
  if (existingForemanDiscrepancy) {
    log("worked-hours-discrepancy", `Test Foreman (${TODAY})`, "reused", existingForemanDiscrepancy.status);
  } else {
    const foremanSession = await signInAs("test.foreman@example.test", STABLE_PASSWORDS.foreman);
    const { error: reportErr } = await foremanSession.rpc("report_worked_hours_discrepancy", { target_worked_hours_id: foremanRow!.id, target_comment: "TEST fixture: hours look short for the shift worked" });
    if (reportErr) throw new Error(`report_worked_hours_discrepancy (foreman): ${reportErr.message}`);
    log("worked-hours-discrepancy", `Test Foreman (${TODAY})`, "created", "open / in review");
  }

  // ==========================================================================
  // Phase H — LMRA: created-by-Employee (own team), Employee-as-participant,
  // two unrelated LMRAs on other teams (Employee must not see), one older
  // historical, one night-shift + one late-shift, one reviewed/approved,
  // one stop-work no-go.
  // ==========================================================================
  const hseqManagerSession = await signInAs("test.hseqmanager@example.test", STABLE_PASSWORDS.hseq_manager);
  const hseqManagerEmployeeId = employeeIdByEmail.get("test.hseqmanager@example.test")!;
  const foreman2Session = await signInAs("test.foreman2@example.test", "TestForemanTwo2026!");
  const foreman3Session = await signInAs("test.foreman3@example.test", "TestForemanThree2026!");
  const foreman2EmployeeId = supportingEmployeeIdByRole["test.foreman2@example.test"];
  const foreman3EmployeeId = supportingEmployeeIdByRole["test.foreman3@example.test"];

  // "today's" Team Alpha is frequently a REUSED row carried forward from a
  // previous run's "create tomorrow's Alpha" step (ensureDailyTeamsForDate's
  // "reused" branch deliberately skips re-running its worker-assignment
  // loop — see that function's own comment) — so its roster can legitimately
  // be empty by the time "today" arrives. create_lmra_assessment's
  // daily_team_id existence check runs under the CALLING employee's own
  // daily_teams_select RLS (SECURITY INVOKER), which only grants a plain
  // employee visibility into a team they're an actual daily_team_members
  // row on — an empty-roster team is therefore invisible to her even
  // though it genuinely exists, producing a misleading "team does not
  // belong to this project/date" error. Top up membership here
  // (idempotent — move_daily_team_member no-ops if already the same
  // team/role) rather than reworking the continuation pipeline itself.
  let alphaLinkable = true;
  for (const memberId of [employeeEmployeeId, plainEmployeeIdByKey.worker01, plainEmployeeIdByKey.worker02]) {
    const { error: topUpErr } = await companyAdminSession.rpc("move_daily_team_member", {
      target_project_id: projectId,
      target_work_date: TODAY,
      target_daily_team_id: todayTeamIds.alpha,
      target_employee_id: memberId,
      target_role: "member",
    });
    if (topUpErr) {
      if (topUpErr.message.includes("pending leave/absence request")) {
        alphaLinkable = false;
        continue;
      }
      throw new Error(`move_daily_team_member (top-up, Alpha, ${memberId}): ${topUpErr.message}`);
    }
  }
  log("daily-team-members", "TEST Team Alpha (today, top-up)", "updated", alphaLinkable ? "membership ensured" : "one member provisionally unavailable");

  const lmraAlphaToday = await ensureLmra({
    key: "employee-own-team-today",
    session: employeeSession,
    companyId,
    projectId,
    workArea: "North Platform — Alpha LMRA",
    workActivity: "Scaffold erection go/no-go check",
    workDate: TODAY,
    shift: "day",
    completedByEmployeeId: employeeEmployeeId,
    responsiblePersonId: employeeEmployeeId,
    participantEmployeeIds: [employeeEmployeeId, plainEmployeeIdByKey.worker01, plainEmployeeIdByKey.worker02],
    dailyTeamId: alphaLinkable ? todayTeamIds.alpha : null,
    result: "go",
  });
  const { error: approveErr } = await hseqManagerSession
    .from("lmra_assessments")
    .update({ status: "approved", reviewed_by: (await hseqManagerSession.auth.getUser()).data.user!.id, reviewed_at: new Date().toISOString(), review_notes: "TEST fixture: reviewed and approved", approved_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("id", lmraAlphaToday)
    .eq("status", "submitted");
  if (approveErr) throw new Error(`lmra review/approve (${lmraAlphaToday}): ${approveErr.message}`);
  log("lmra-review", "employee-own-team-today", "updated", "approved");

  await ensureLmra({
    key: "employee-as-participant",
    session: hseqManagerSession,
    companyId,
    projectId,
    workArea: "North Platform — General Safety Check",
    workActivity: "Pre-shift general area walk-down",
    workDate: TODAY,
    shift: "day",
    completedByEmployeeId: hseqManagerEmployeeId,
    responsiblePersonId: hseqManagerEmployeeId,
    participantEmployeeIds: [hseqManagerEmployeeId, employeeEmployeeId],
    dailyTeamId: null,
    result: "go",
  });

  await ensureLmra({
    key: "bravo-team-unrelated",
    session: foreman2Session,
    companyId,
    projectId,
    workArea: "South Platform — Bravo LMRA",
    workActivity: "Pipe insulation go/no-go check",
    workDate: TODAY,
    shift: "day",
    completedByEmployeeId: foreman2EmployeeId,
    responsiblePersonId: foreman2EmployeeId,
    participantEmployeeIds: [foreman2EmployeeId, plainEmployeeIdByKey.worker05, plainEmployeeIdByKey.worker06],
    dailyTeamId: todayTeamIds.bravo,
    result: "go",
  });

  await ensureLmra({
    key: "charlie-team-night-shift-stop-work",
    session: foreman3Session,
    companyId,
    projectId,
    workArea: "Tank Farm — Charlie LMRA",
    workActivity: "Electrical maintenance go/no-go check",
    workDate: TODAY,
    shift: "night",
    completedByEmployeeId: foreman3EmployeeId,
    responsiblePersonId: foreman3EmployeeId,
    participantEmployeeIds: [foreman3EmployeeId, plainEmployeeIdByKey.worker09, plainEmployeeIdByKey.worker10],
    dailyTeamId: todayTeamIds.charlie,
    result: "no_go",
    stopWorkReason: "TEST fixture: severe weather warning — lightning risk, all elevated work stopped",
  });

  await ensureLmra({
    key: "late-shift-unrelated",
    session: hseqManagerSession,
    companyId,
    projectId,
    workArea: "Warehouse — Late Shift Check",
    workActivity: "Stores security and housekeeping walk-down",
    workDate: TODAY,
    shift: "late",
    completedByEmployeeId: hseqManagerEmployeeId,
    responsiblePersonId: hseqManagerEmployeeId,
    participantEmployeeIds: [hseqManagerEmployeeId],
    dailyTeamId: null,
    result: "go",
  });

  const { data: historicalAlphaTeam } = await companyAdminSession.from("daily_teams").select("id").eq("company_id", companyId).eq("project_id", projectId).eq("work_date", isoDate(9)).eq("name", "TEST Team Alpha").maybeSingle();
  // Same RLS-invisibility class as today's Alpha top-up above — a
  // historical team pulled forward via copy_daily_teams_to_date may not
  // carry Test Employee's membership row, making it invisible to her own
  // daily_teams_select RLS even though it exists.
  let historicalAlphaLinkable = Boolean(historicalAlphaTeam);
  if (historicalAlphaTeam) {
    for (const memberId of [employeeEmployeeId, plainEmployeeIdByKey.worker01]) {
      const { error: topUpErr } = await companyAdminSession.rpc("move_daily_team_member", {
        target_project_id: projectId,
        target_work_date: isoDate(9),
        target_daily_team_id: historicalAlphaTeam.id,
        target_employee_id: memberId,
        target_role: "member",
      });
      if (topUpErr) {
        if (topUpErr.message.includes("pending leave/absence request") || topUpErr.message.includes("locked")) {
          // A locked historical team (real, correct product behavior —
          // locked-as-evidence teams are immutable) can't be topped up
          // retroactively; the fixture simply links no team for this
          // historical LMRA instead of failing the whole seed run.
          historicalAlphaLinkable = false;
          continue;
        }
        throw new Error(`move_daily_team_member (top-up, historical Alpha, ${memberId}): ${topUpErr.message}`);
      }
    }
  }
  await ensureLmra({
    key: "employee-historical-previous-week",
    session: employeeSession,
    companyId,
    projectId,
    workArea: "North Platform — Alpha LMRA (Historical)",
    workActivity: "Scaffold erection go/no-go check",
    workDate: isoDate(9),
    shift: "day",
    completedByEmployeeId: employeeEmployeeId,
    responsiblePersonId: employeeEmployeeId,
    participantEmployeeIds: [employeeEmployeeId, plainEmployeeIdByKey.worker01],
    dailyTeamId: historicalAlphaLinkable ? (historicalAlphaTeam?.id ?? null) : null,
    result: "go",
  });

  // ==========================================================================
  // Phase I — Scaffolds + Inspections: 6 scaffolds, different types/
  // foremen/erection teams, varied inspection states (safe, restricted,
  // stale/due, defect/awaiting-corrective-action, no inspection yet,
  // multiple historical inspections).
  // ==========================================================================
  const inspectorEmployeeIdForScaffolds = employeeIdByEmail.get("test.inspector@example.test")!;
  const hseOfficerEmployeeId = employeeIdByEmail.get("test.hseofficer@example.test")!;
  const hseqManagerEmployeeIdForScaffolds = employeeIdByEmail.get("test.hseqmanager@example.test")!;
  const hseOfficerSession = await signInAs("test.hseofficer@example.test", STABLE_PASSWORDS.hse_officer);

  // scaffold_erection_teams requires the linked daily_team's work_date to
  // match the scaffold's own erected_at — look up the per-date team ids
  // the "copy to historical dates" step (Phase E) already created.
  async function lookupTeamId(workDate: string, name: string): Promise<string> {
    const { data } = await companyAdminSession.from("daily_teams").select("id").eq("company_id", companyId).eq("project_id", projectId).eq("work_date", workDate).eq("name", name).maybeSingle();
    if (!data) throw new Error(`daily_teams lookup failed for "${name}" on ${workDate}`);
    return data.id;
  }
  const alphaDay1 = await lookupTeamId(isoDate(1), "TEST Team Alpha");
  const bravoDay1 = await lookupTeamId(isoDate(1), "TEST Team Bravo");
  const charlieDay1 = await lookupTeamId(isoDate(1), "TEST Team Charlie");
  const bravoDay2 = await lookupTeamId(isoDate(2), "TEST Team Bravo");
  const alphaDay9 = await lookupTeamId(isoDate(9), "TEST Team Alpha");

  const scaffold1 = await ensureScaffold({ session: companyAdminSession, manageSession: hseqManagerSession, companyId, projectId, tagNumber: "TEST-SC-001", workArea: "North Platform", scaffoldType: "independent", responsibleForemanId: employeeIdByKey.foreman, erectedAtDaysAgo: 9, erectionTeamId: alphaDay9 });
  await ensureInspection({ session: inspectorSession, companyId, projectId, scaffoldId: scaffold1, scaffoldTag: "TEST-SC-001", inspectorId: inspectorEmployeeIdForScaffolds, inspectedAtDaysAgo: 1, reason: "routine_inspection", outcome: "safe_for_use" });

  const scaffold2 = await ensureScaffold({ session: companyAdminSession, manageSession: hseqManagerSession, companyId, projectId, tagNumber: "TEST-SC-002", workArea: "South Platform", scaffoldType: "birdcage", responsibleForemanId: employeeIdByKey.foreman2, erectedAtDaysAgo: 2, erectionTeamId: bravoDay2 });
  await ensureInspection({ session: hseOfficerSession, companyId, projectId, scaffoldId: scaffold2, scaffoldTag: "TEST-SC-002", inspectorId: hseOfficerEmployeeId, inspectedAtDaysAgo: 2, reason: "routine_inspection", outcome: "safe_with_restrictions" });

  const scaffold3 = await ensureScaffold({ session: companyAdminSession, manageSession: hseqManagerSession, companyId, projectId, tagNumber: "TEST-SC-003", workArea: "Tank Farm", scaffoldType: "mobile", responsibleForemanId: employeeIdByKey.foreman3, erectedAtDaysAgo: 1, erectionTeamId: charlieDay1 });
  await ensureInspection({ session: inspectorSession, companyId, projectId, scaffoldId: scaffold3, scaffoldTag: "TEST-SC-003", inspectorId: inspectorEmployeeIdForScaffolds, inspectedAtDaysAgo: 9, reason: "initial_handover", outcome: "safe_for_use" });

  const scaffold4 = await ensureScaffold({ session: companyAdminSession, manageSession: hseqManagerSession, companyId, projectId, tagNumber: "TEST-SC-004", workArea: "North Platform", scaffoldType: "suspended", responsibleForemanId: employeeIdByKey.foreman, erectedAtDaysAgo: 9, erectionTeamId: alphaDay9 });
  await ensureInspection({ session: inspectorSession, companyId, projectId, scaffoldId: scaffold4, scaffoldTag: "TEST-SC-004", inspectorId: inspectorEmployeeIdForScaffolds, inspectedAtDaysAgo: 9, reason: "initial_handover", outcome: "safe_for_use" });
  await ensureInspection({ session: hseqManagerSession, companyId, projectId, scaffoldId: scaffold4, scaffoldTag: "TEST-SC-004", inspectorId: hseqManagerEmployeeIdForScaffolds, inspectedAtDaysAgo: 2, reason: "routine_inspection", outcome: "safe_for_use" });

  const scaffold5 = await ensureScaffold({ session: companyAdminSession, manageSession: hseqManagerSession, companyId, projectId, tagNumber: "TEST-SC-005", workArea: "South Platform", scaffoldType: "cantilever", responsibleForemanId: employeeIdByKey.foreman2, erectedAtDaysAgo: 1, erectionTeamId: bravoDay1 });
  await ensureInspection({
    session: hseOfficerSession,
    companyId,
    projectId,
    scaffoldId: scaffold5,
    scaffoldTag: "TEST-SC-005",
    inspectorId: hseOfficerEmployeeId,
    inspectedAtDaysAgo: 1,
    reason: "after_impact_incident",
    outcome: "awaiting_corrective_action",
    defectItemTypes: ["guardrails", "toe_boards", "access_ladders_stairways"],
  });

  await ensureScaffold({ session: companyAdminSession, manageSession: hseqManagerSession, companyId, projectId, tagNumber: "TEST-SC-006", workArea: "Warehouse Yard", scaffoldType: "access_tower", responsibleForemanId: employeeIdByKey.foreman3, erectedAtDaysAgo: 1, erectionTeamId: alphaDay1 });
  // TEST-SC-006 deliberately has NO inspection yet — pending_inspection status, for that state to be manually testable too.

  // Configurable inspection frequency + Scaffold Map fixture coverage
  // (Part AL) — daily/7/30/custom frequencies, due-today, due-tomorrow,
  // dismantled, with/without coordinates. Coordinates are a real
  // industrial-site-shaped cluster near Stockholm (matching this fixture
  // project's Europe/Stockholm timezone) purely for a realistic map view.
  const scaffold7 = await ensureScaffold({
    session: companyAdminSession, manageSession: hseqManagerSession, companyId, projectId, tagNumber: "TEST-SC-007", workArea: "North Platform", scaffoldType: "independent",
    responsibleForemanId: employeeIdByKey.foreman, erectedAtDaysAgo: 9, erectionTeamId: alphaDay9,
    intervalType: "seven_days", intervalDays: 7, latitude: 59.3346, longitude: 18.0632,
    clientName: "Nordic Steelworks AB",
  });
  await ensureInspection({ session: inspectorSession, companyId, projectId, scaffoldId: scaffold7, scaffoldTag: "TEST-SC-007", inspectorId: inspectorEmployeeIdForScaffolds, inspectedAtDaysAgo: 7, reason: "routine_inspection", outcome: "safe_for_use" });
  // 7 days ago + 7-day interval = due TODAY.

  // Part 17 crew fixture — TEST-SC-007 has a real located map card AND a
  // multi-source erection crew: four people fast-filled from Team Alpha
  // (source=team_import), plus worker05 added manually even though
  // worker05's home team is Bravo, not Alpha (source=manual — Part 3B's
  // "worker from Team A and Team B on the same scaffold" case).
  for (const key of ["employee", "worker01", "worker02", "worker03", "worker04"] as const) {
    await ensureScaffoldParticipant({
      session: companyAdminSession, companyId, projectId, scaffoldId: scaffold7, scaffoldTag: "TEST-SC-007",
      employeeId: employeeIdByKey[key], workDate: isoDate(9), source: "team_import", sourceDailyTeamId: alphaDay9,
    });
  }
  await ensureScaffoldParticipant({
    session: companyAdminSession, companyId, projectId, scaffoldId: scaffold7, scaffoldTag: "TEST-SC-007",
    employeeId: plainEmployeeIdByKey.worker05, workDate: isoDate(9), source: "manual",
  });

  const scaffold8 = await ensureScaffold({
    session: companyAdminSession, manageSession: hseqManagerSession, companyId, projectId, tagNumber: "TEST-SC-008", workArea: "South Platform", scaffoldType: "birdcage",
    responsibleForemanId: employeeIdByKey.foreman2, erectedAtDaysAgo: 9, erectionTeamId: alphaDay9,
    intervalType: "seven_days", intervalDays: 7, latitude: 59.336, longitude: 18.059,
    clientName: "Baltic Refinery Partners",
  });
  await ensureInspection({ session: inspectorSession, companyId, projectId, scaffoldId: scaffold8, scaffoldTag: "TEST-SC-008", inspectorId: inspectorEmployeeIdForScaffolds, inspectedAtDaysAgo: 6, reason: "routine_inspection", outcome: "safe_for_use" });
  // 6 days ago + 7-day interval = due TOMORROW.

  // Part 13 fixture — worker01 also worked TEST-SC-008 the SAME work_date
  // (day 9) as their TEST-SC-007 team_import participation above. The
  // active-unique index is per-scaffold only, so this is expected to
  // succeed, not conflict — proving one worker on two scaffolds same day.
  await ensureScaffoldParticipant({
    session: companyAdminSession, companyId, projectId, scaffoldId: scaffold8, scaffoldTag: "TEST-SC-008",
    employeeId: plainEmployeeIdByKey.worker01, workDate: isoDate(9), source: "manual",
  });

  const scaffold9 = await ensureScaffold({
    session: companyAdminSession, manageSession: hseqManagerSession, companyId, projectId, tagNumber: "TEST-SC-009", workArea: "Tank Farm", scaffoldType: "mobile",
    responsibleForemanId: employeeIdByKey.foreman3, erectedAtDaysAgo: 9, erectionTeamId: alphaDay9,
    intervalType: "daily", intervalDays: 1,
  });
  await ensureInspection({ session: hseOfficerSession, companyId, projectId, scaffoldId: scaffold9, scaffoldTag: "TEST-SC-009", inspectorId: hseOfficerEmployeeId, inspectedAtDaysAgo: 0, reason: "routine_inspection", outcome: "safe_for_use" });
  // Daily cadence, inspected today — no coordinates set ("Location not set").

  const scaffold10 = await ensureScaffold({
    session: companyAdminSession, manageSession: hseqManagerSession, companyId, projectId, tagNumber: "TEST-SC-010", workArea: "Warehouse Yard", scaffoldType: "loading_bay",
    responsibleForemanId: employeeIdByKey.foreman, erectedAtDaysAgo: 9, erectionTeamId: alphaDay9,
    intervalType: "thirty_days", intervalDays: 30,
  });
  await ensureInspection({ session: inspectorSession, companyId, projectId, scaffoldId: scaffold10, scaffoldTag: "TEST-SC-010", inspectorId: inspectorEmployeeIdForScaffolds, inspectedAtDaysAgo: 2, reason: "routine_inspection", outcome: "safe_for_use" });
  // 30-day cadence, well within validity — no coordinates set.

  const scaffold11 = await ensureScaffold({
    session: companyAdminSession, manageSession: hseqManagerSession, companyId, projectId, tagNumber: "TEST-SC-011", workArea: "North Platform", scaffoldType: "temporary_roof",
    responsibleForemanId: employeeIdByKey.foreman2, erectedAtDaysAgo: 9, erectionTeamId: alphaDay9,
    intervalType: "custom", intervalDays: 14, latitude: 59.333, longitude: 18.066,
  });
  await ensureInspection({ session: hseOfficerSession, companyId, projectId, scaffoldId: scaffold11, scaffoldTag: "TEST-SC-011", inspectorId: hseOfficerEmployeeId, inspectedAtDaysAgo: 1, reason: "routine_inspection", outcome: "safe_for_use" });
  // Custom 14-day cadence, well within validity.

  const scaffold12 = await ensureScaffold({
    session: companyAdminSession, manageSession: hseqManagerSession, companyId, projectId, tagNumber: "TEST-SC-012", workArea: "South Platform", scaffoldType: "other",
    responsibleForemanId: employeeIdByKey.foreman3, erectedAtDaysAgo: 9, erectionTeamId: alphaDay9, latitude: 59.3378, longitude: 18.0602,
  });
  await ensureInspection({ session: hseqManagerSession, companyId, projectId, scaffoldId: scaffold12, scaffoldTag: "TEST-SC-012", inspectorId: hseqManagerEmployeeIdForScaffolds, inspectedAtDaysAgo: 1, reason: "other", outcome: "closed_dismantled" });
  // Dismantled/archived — excluded from operational inspection health by default (Part I/J).

  // Operational-realism pass — the one inspection-health state the
  // existing 12 scaffolds never demonstrated: genuinely EXPIRED (a
  // 7-day interval, last inspected well past both the interval AND
  // "due today", never re-inspected since).
  const scaffold13 = await ensureScaffold({
    session: companyAdminSession, manageSession: hseqManagerSession, companyId, projectId, tagNumber: "TEST-SC-013", workArea: "Pipe Rack A", scaffoldType: "independent",
    responsibleForemanId: employeeIdByKey.foreman4, erectedAtDaysAgo: 9, erectionTeamId: alphaDay9,
    intervalType: "seven_days", intervalDays: 7, latitude: 59.3312, longitude: 18.0685,
    clientName: "Nordic Steelworks AB",
  });
  await ensureInspection({ session: inspectorSession, companyId, projectId, scaffoldId: scaffold13, scaffoldTag: "TEST-SC-013", inspectorId: inspectorEmployeeIdForScaffolds, inspectedAtDaysAgo: 9, reason: "initial_handover", outcome: "safe_for_use" });
  // Inspected 9 days ago on a 7-day interval = 2 days overdue = Expired.

  // ==========================================================================
  // Phase J — Safety Observations + Corrective Actions.
  // ==========================================================================
  const testForemanSession = await signInAs("test.foreman@example.test", STABLE_PASSWORDS.foreman);
  const inspectorEmployeeIdForObs = employeeIdByEmail.get("test.inspector@example.test")!;

  const obsPositiveGeneral = await ensureObservation({
    session: testForemanSession, companyId, projectId, workArea: "North Platform", observedAtDaysAgo: 1, observerId: employeeIdByKey.foreman,
    category: "positive_observation", description: "TEST fixture: crew consistently wearing full PPE and maintaining tidy work area on North Platform.",
    riskLevel: "low", isStopWork: false, observationType: "positive", targetType: "daily_team", targetDailyTeamId: todayTeamIds.alpha,
  });

  const obsNegativeEmployee = await ensureObservation({
    session: hseOfficerSession, companyId, projectId, workArea: "North Platform", observedAtDaysAgo: 1, observerId: hseOfficerEmployeeId,
    category: "ppe", description: "TEST fixture: worker observed without safety glasses during grinding operation.",
    riskLevel: "medium", isStopWork: false, observationType: "negative", targetType: "employee", targetEmployeeId: employeeEmployeeId, disposition: "coaching",
  });

  await ensureObservation({
    session: testForemanSession, companyId, projectId, workArea: "North Platform", observedAtDaysAgo: 2, observerId: employeeIdByKey.foreman,
    category: "housekeeping", description: "TEST fixture: general housekeeping walk-down for Team Alpha's work area, no issues found.",
    riskLevel: "low", isStopWork: false, observationType: "general", targetType: "daily_team", targetDailyTeamId: alphaDay1,
  });

  await ensureObservation({
    session: hseOfficerSession, companyId, projectId, workArea: "South Platform", observedAtDaysAgo: 1, observerId: hseOfficerEmployeeId,
    category: "line_of_fire", description: "TEST fixture: South Platform crew — unrelated observation Test Employee must not see.",
    riskLevel: "medium", isStopWork: false, observationType: "negative", targetType: "daily_team", targetDailyTeamId: todayTeamIds.bravo, disposition: "coaching",
  });

  const obsStopWork = await ensureObservation({
    session: hseOfficerSession, companyId, projectId, workArea: "Tank Farm", observedAtDaysAgo: 1, observerId: hseOfficerEmployeeId,
    category: "unsafe_condition", description: "TEST fixture: lightning risk observed — work stopped immediately on Tank Farm, matches the Charlie LMRA no-go.",
    riskLevel: "critical", isStopWork: true, observationType: "negative", targetType: "daily_team", targetDailyTeamId: todayTeamIds.charlie, disposition: "corrective_action",
  });

  await ensureObservation({
    session: inspectorSession, companyId, projectId, workArea: "Warehouse Yard", observedAtDaysAgo: 3, observerId: inspectorEmployeeIdForObs,
    category: "unsafe_act", description: "TEST fixture: inspector-raised observation — unrelated to Test Employee's team.",
    riskLevel: "medium", isStopWork: false, observationType: "negative", targetType: "daily_team", targetDailyTeamId: charlieDay1, disposition: "coaching",
  });

  await ensureCorrectiveAction({ session: hseqManagerSession, companyId, projectId, observationId: obsNegativeEmployee, description: "TEST fixture: replace/replenish safety glasses stock at North Platform station and retrain worker.", responsiblePersonId: employeeEmployeeId, priority: "medium", dueInDays: -5, finalStatus: "open" });
  await ensureCorrectiveAction({ session: hseqManagerSession, companyId, projectId, observationId: obsStopWork, description: "TEST fixture: install lightning-detection alert procedure for Tank Farm elevated work.", responsiblePersonId: employeeIdByKey.foreman3, priority: "high", dueInDays: -3, finalStatus: "in_progress" });
  await ensureCorrectiveAction({ session: hseqManagerSession, companyId, projectId, observationId: obsPositiveGeneral, description: "TEST fixture: document North Platform's good-practice housekeeping routine for company-wide sharing.", responsiblePersonId: employeeIdByKey.foreman, priority: "low", dueInDays: -1, finalStatus: "awaiting_verification" });
  await ensureCorrectiveAction({ session: hseqManagerSession, companyId, projectId, observationId: obsNegativeEmployee, description: "TEST fixture: PPE station signage refreshed and re-stocked — verified closed.", responsiblePersonId: plainEmployeeIdByKey.worker01, priority: "medium", dueInDays: 2, finalStatus: "closed" });
  await ensureCorrectiveAction({ session: hseqManagerSession, companyId, projectId, observationId: obsStopWork, description: "TEST fixture: initial corrective plan rejected — needs a more detailed weather-monitoring procedure.", responsiblePersonId: plainEmployeeIdByKey.worker09, priority: "high", dueInDays: 1, finalStatus: "rejected" });

  // ==========================================================================
  // Phase K — Toolbox Meetings + Templates + Safety Flash.
  // ==========================================================================
  const hseqManagerUserId = (await hseqManagerSession.auth.getUser()).data.user!.id;
  const hseOfficerUserId = (await hseOfficerSession.auth.getUser()).data.user!.id;

  await ensureToolboxMeeting({ session: hseqManagerSession, companyId, projectId, title: "TEST Weekly Toolbox — Scaffold Safety", meetingDate: TODAY, workArea: "North Platform", heldByEmployeeId: hseqManagerEmployeeIdForScaffolds, uploadedByUserId: hseqManagerUserId });
  await ensureToolboxMeeting({ session: hseOfficerSession, companyId, projectId, title: "TEST Weekly Toolbox — PPE Compliance", meetingDate: isoDate(7), workArea: "South Platform", heldByEmployeeId: hseOfficerEmployeeId, uploadedByUserId: hseOfficerUserId });

  await ensureToolboxTemplate({ session: hseqManagerSession, companyId, title: "TEST Template — Working at Height Toolbox Talk", category: "working_at_height", language: "en", uploadedByUserId: hseqManagerUserId });
  await ensureToolboxTemplate({ session: hseqManagerSession, companyId, title: "TEST Template — PPE Toolbox Talk", category: "ppe", language: "en", uploadedByUserId: hseqManagerUserId });

  await ensureSafetyFlash({ session: hseqManagerSession, companyId, projectId, title: "TEST Safety Flash — Recent Near-Miss: Falling Object", dateIssued: isoDate(1), category: "falling_objects", issuedByEmployeeId: hseqManagerEmployeeIdForScaffolds, uploadedByUserId: hseqManagerUserId });
  await ensureSafetyFlash({ session: hseOfficerSession, companyId, projectId: null, title: "TEST Safety Flash — Company-Wide Heat Stress Advisory", dateIssued: isoDate(2), category: "weather_conditions", issuedByEmployeeId: hseOfficerEmployeeId, uploadedByUserId: hseOfficerUserId });
  await ensureSafetyFlash({ session: hseqManagerSession, companyId, projectId, title: "TEST Safety Flash — Archived: Previous Site Access Advisory", dateIssued: isoDate(60), category: "access_egress", issuedByEmployeeId: hseqManagerEmployeeIdForScaffolds, uploadedByUserId: hseqManagerUserId, status: "archived" });

  // ==========================================================================
  // Phase L — Equipment.
  // ==========================================================================
  const helmetId = await ensureEquipmentItem({ session: companyAdminSession, companyId, projectId, trackingMode: "quantity", category: "PPE", name: "Safety Helmet", quantity: 30, defaultValidityDays: 1825 });
  const harnessId = await ensureEquipmentItem({ session: companyAdminSession, companyId, projectId, trackingMode: "serialized", category: "Fall Protection", name: "Safety Harness" });

  // Part 29/46 — pricing fixture coverage (unit_price/currency are new
  // columns with no create_equipment_item() RPC parameter yet — a direct,
  // idempotent follow-up UPDATE is the simplest correct path, matching
  // "Equipment pricing: nullable initially" — every other catalog item
  // stays null-priced, exactly like a real not-yet-priced item).
  for (const [itemId, price] of [
    [helmetId, 24.0],
    [harnessId, 180.0],
  ] as const) {
    const { error: priceErr } = await companyAdminSession.from("equipment_items").update({ unit_price: price, currency: "EUR" }).eq("id", itemId);
    if (priceErr) throw new Error(`equipment_items unit_price set: ${priceErr.message}`);
  }
  log("equipment-item-pricing", "Safety Helmet + Safety Harness", "updated", "unit_price set (EUR)");
  const hiVisId = await ensureEquipmentItem({ session: companyAdminSession, companyId, projectId, trackingMode: "quantity", category: "PPE", name: "Hi-Vis Vest", quantity: 40 });
  await ensureEquipmentItem({ session: companyAdminSession, companyId, projectId, trackingMode: "quantity", category: "PPE", name: "Gloves", quantity: 60 });
  await ensureEquipmentItem({ session: companyAdminSession, companyId, projectId, trackingMode: "quantity", category: "PPE", name: "Safety Glasses", quantity: 40 });
  const srlId = await ensureEquipmentItem({ session: companyAdminSession, companyId, projectId, trackingMode: "serialized", category: "Fall Protection", name: "SRL (Self-Retracting Lifeline)", defaultValidityDays: 1825 });
  const gasDetectorId = await ensureEquipmentItem({ session: companyAdminSession, companyId, projectId, trackingMode: "serialized", category: "Gas Detection", name: "Gas Detector", defaultValidityDays: 365 });
  await ensureEquipmentItem({ session: companyAdminSession, companyId, projectId, trackingMode: "serialized", category: "Radio / Communication", name: "Radio" });
  const toolBagId = await ensureEquipmentItem({ session: companyAdminSession, companyId, projectId, trackingMode: "serialized", category: "Hand Tool", name: "Tool Bag" });
  await ensureEquipmentItem({ session: companyAdminSession, companyId, projectId, trackingMode: "serialized", category: "Power Tool", name: "Cordless Drill" });
  const doubleHooksId = await ensureEquipmentItem({ session: companyAdminSession, companyId, projectId, trackingMode: "serialized", category: "Fall Protection", name: "Double Hooks", defaultValidityDays: 1825 });
  { const { error: priceErr } = await companyAdminSession.from("equipment_items").update({ unit_price: 45.0, currency: "EUR" }).eq("id", doubleHooksId); if (priceErr) throw new Error(`equipment_items unit_price set (Double Hooks): ${priceErr.message}`); }

  // Operational-realism pass — additional physical units of the same
  // serialized catalog items (Part 25's "multiple harnesses/SRL/radios
  // with serial numbers"), a mixed condition/status spread, and issuance
  // to Foreman/Inspector so their own "My Equipment" isn't empty (Parts
  // 6/7).
  const harness2Id = await ensureSerializedUnit({ session: companyAdminSession, companyId, projectId, category: "Fall Protection", name: "Safety Harness", referenceNumber: "HARN-002", unitPrice: 180.0 });
  const harness3Id = await ensureSerializedUnit({ session: companyAdminSession, companyId, projectId, category: "Fall Protection", name: "Safety Harness", referenceNumber: "HARN-003", unitPrice: 180.0 });
  const srl2Id = await ensureSerializedUnit({ session: companyAdminSession, companyId, projectId, category: "Fall Protection", name: "SRL (Self-Retracting Lifeline)", referenceNumber: "SRL-002", defaultValidityDays: 1825, unitPrice: 220.0 });
  const radio2Id = await ensureSerializedUnit({ session: companyAdminSession, companyId, projectId, category: "Radio / Communication", name: "Radio", referenceNumber: "RADIO-002", unitPrice: 90.0 });
  const radio3Id = await ensureSerializedUnit({ session: companyAdminSession, companyId, projectId, category: "Radio / Communication", name: "Radio", referenceNumber: "RADIO-003", unitPrice: 90.0 });
  const doubleHooks2Id = await ensureSerializedUnit({ session: companyAdminSession, companyId, projectId, category: "Fall Protection", name: "Double Hooks", referenceNumber: "HOOKS-002", defaultValidityDays: 1825, unitPrice: 45.0 });

  async function ensureIssuance(itemId: string, employeeId: string, issuedAtDaysAgo: number, expiresAt: string | undefined, useDefault: boolean, label: string) {
    const { data: existingRows, error: existingErr } = await companyAdminSession.from("equipment_assignments").select("id").eq("company_id", companyId).eq("equipment_item_id", itemId).eq("employee_id", employeeId).eq("status", "active").limit(1);
    if (existingErr) throw new Error(`equipment_assignments existence check (${label}): ${existingErr.message}`);
    if (existingRows && existingRows.length > 0) {
      log("equipment-assignment", label, "reused");
      return;
    }
    const { error } = await companyAdminSession.rpc("issue_equipment", {
      target_item_id: itemId,
      target_employee_id: employeeId,
      target_quantity: 1,
      target_condition_at_issue: "new",
      target_issued_at: isoDate(issuedAtDaysAgo),
      target_expires_at: expiresAt,
      target_use_default_validity: useDefault,
    });
    if (error) throw new Error(`issue_equipment (${label}): ${error.message}`);
    log("equipment-assignment", label, "created");
  }

  // >30 days remaining
  await ensureIssuance(harnessId, employeeEmployeeId, 0, undefined, true, "Test Employee <- Safety Harness (>30d remaining)");
  // expiring within 30 days (issued long enough ago that its 365-day default is now inside the 30-day window)
  await ensureIssuance(gasDetectorId, employeeEmployeeId, 340, undefined, true, "Test Employee <- Gas Detector (expiring soon)");
  // already expired (explicit override in the past)
  await ensureIssuance(srlId, employeeEmployeeId, 10, isoDate(4), false, "Test Employee <- SRL (expired)");
  // no expiry at all (item has no default, none set)
  await ensureIssuance(hiVisId, employeeEmployeeId, 0, undefined, false, "Test Employee <- Hi-Vis Vest (no expiry)");
  // A helmet too, for realism (long validity)
  await ensureIssuance(helmetId, employeeEmployeeId, 0, undefined, true, "Test Employee <- Safety Helmet (long validity)");

  // Foreman and Inspector each get their own issued equipment (Parts
  // 6/7 — their "My Equipment" must not look empty).
  await ensureIssuance(harness2Id, foremanEmployeeId2, 5, undefined, true, "Test Foreman <- Safety Harness HARN-002");
  await ensureIssuance(radio2Id, foremanEmployeeId2, 5, undefined, false, "Test Foreman <- Radio RADIO-002");
  await ensureIssuance(harness3Id, inspectorEmployeeIdForScaffolds, 5, undefined, true, "Test Inspector <- Safety Harness HARN-003");
  await ensureIssuance(radio3Id, inspectorEmployeeIdForScaffolds, 5, undefined, false, "Test Inspector <- Radio RADIO-003");

  // A damaged-then-recovered SRL — genuine equipment_history beyond
  // added/issued/returned (Part 18's "damaged/returned history").
  //
  // Gating on the item's CURRENT status is not idempotent: recover_equipment
  // always leaves status = 'available', which is the same status a
  // never-damaged item starts in — so a status-only check would re-run
  // (and append two more equipment_history rows) on every single re-run.
  // Checking equipment_history directly for a prior 'damaged' event is the
  // only reliable "has this already happened" signal.
  const { data: srl2DamageHistory, error: srl2HistoryErr } = await companyAdminSession.from("equipment_history").select("id").eq("equipment_item_id", srl2Id).eq("event", "damaged").limit(1);
  if (srl2HistoryErr) throw new Error(`equipment_history existence check (SRL-002): ${srl2HistoryErr.message}`);
  if (!srl2DamageHistory || srl2DamageHistory.length === 0) {
    const { error: damagedErr } = await companyAdminSession.rpc("mark_equipment_damaged", { target_item_id: srl2Id, target_quantity: 1, target_note: "TEST fixture: webbing frayed during Tank Farm inspection" });
    if (damagedErr) throw new Error(`mark_equipment_damaged (SRL-002): ${damagedErr.message}`);
    log("equipment-lifecycle", "SRL-002 marked damaged", "created");
    const { error: recoveredErr } = await companyAdminSession.rpc("recover_equipment", { target_item_id: srl2Id, target_quantity: 1, target_note: "TEST fixture: repaired and re-certified" });
    if (recoveredErr) throw new Error(`recover_equipment (SRL-002): ${recoveredErr.message}`);
    log("equipment-lifecycle", "SRL-002 recovered", "updated");
  } else {
    log("equipment-lifecycle", "SRL-002 damaged/recovered history", "reused");
  }

  // Double Hooks unit #2 — issue then return, for real returned-item
  // history (distinct from the damaged/recovered SRL above).
  const { data: existingHooksAssignment } = await companyAdminSession.from("equipment_assignments").select("id, status").eq("company_id", companyId).eq("equipment_item_id", doubleHooks2Id).eq("employee_id", plainEmployeeIdByKey.worker13).limit(1).maybeSingle();
  if (existingHooksAssignment) {
    log("equipment-lifecycle", "Double Hooks HOOKS-002 issue/return", "reused", existingHooksAssignment.status);
  } else {
    const { data: hooksAssignment, error: issueErr } = await companyAdminSession.rpc("issue_equipment", { target_item_id: doubleHooks2Id, target_employee_id: plainEmployeeIdByKey.worker13, target_quantity: 1, target_condition_at_issue: "new", target_issued_at: isoDate(6) }).single();
    if (issueErr || !hooksAssignment) throw new Error(`issue_equipment (Double Hooks HOOKS-002): ${issueErr?.message}`);
    log("equipment-lifecycle", "Double Hooks HOOKS-002 issued", "created");
    const { error: returnErr } = await companyAdminSession.rpc("return_equipment", { target_assignment_id: (hooksAssignment as { id: string }).id, target_returned_quantity: 1, target_condition_at_return: "good", target_returned_at: isoDate(1), target_note: "TEST fixture: task complete, returned in good condition" });
    if (returnErr) throw new Error(`return_equipment (Double Hooks HOOKS-002): ${returnErr.message}`);
    log("equipment-lifecycle", "Double Hooks HOOKS-002 returned", "updated");
  }

  async function ensureEquipmentRequest(itemId: string | null, description: string, quantity: number, reason: string, finalStatus: "pending" | "approved" | "fulfilled" | "denied"): Promise<string> {
    const { data: existingRows } = await employeeSession.from("equipment_requests").select("id, status").eq("company_id", companyId).eq("project_id", projectId).eq("employee_id", employeeEmployeeId).eq("item_description", description).limit(1);
    if (existingRows && existingRows.length > 0) {
      log("equipment-request", description, "reused", existingRows[0].status);
      return existingRows[0].id;
    }
    const { data, error } = await employeeSession.from("equipment_requests").insert({ company_id: companyId, project_id: projectId, employee_id: employeeEmployeeId, equipment_item_id: itemId, item_description: description, quantity, reason }).select("id").single();
    if (error || !data) throw new Error(`equipment_requests insert (${description}): ${error?.message}`);
    const id = data.id;
    log("equipment-request", description, "created");

    if (finalStatus === "approved" || finalStatus === "fulfilled") {
      const { error: approveErr } = await companyAdminSession.rpc("approve_equipment_request", { target_request_id: id, target_comment: "TEST fixture: approved" });
      if (approveErr) throw new Error(`approve_equipment_request (${description}): ${approveErr.message}`);
    }
    if (finalStatus === "fulfilled" && itemId) {
      const { error: issueErr } = await companyAdminSession.rpc("issue_equipment", { target_item_id: itemId, target_employee_id: employeeEmployeeId, target_quantity: quantity, target_condition_at_issue: "new", target_request_id: id });
      if (issueErr) throw new Error(`issue_equipment for request (${description}): ${issueErr.message}`);
    }
    if (finalStatus === "denied") {
      const { error: denyErr } = await companyAdminSession.rpc("deny_equipment_request", { target_request_id: id, target_comment: "TEST fixture: denied — not required for current scope of work" });
      if (denyErr) throw new Error(`deny_equipment_request (${description}): ${denyErr.message}`);
    }
    log("equipment-request-lifecycle", description, "updated", finalStatus);
    return id;
  }

  await ensureEquipmentRequest(null, "TEST fixture request: Ear defenders", 1, "Working near noisy compressor for extended periods.", "pending");
  await ensureEquipmentRequest(null, "TEST fixture request: Knee pads", 1, "Frequent kneeling work on scaffold decking.", "approved");
  await ensureEquipmentRequest(null, "TEST fixture request: Extra radio for personal use", 1, "Would like a spare radio.", "denied");
  await ensureEquipmentRequest(toolBagId, "TEST fixture request: Tool Bag", 1, "Existing tool bag is worn out.", "fulfilled");

  // ==========================================================================
  // Phase M — mark the OLDEST couple of Test Employee's real (trigger-
  // fired) notifications as read, so the bell shows a genuine mix rather
  // than "everything unread" — never a synthetic insert, just read_at on
  // notifications the real workflow above already created.
  // ==========================================================================
  const { data: oldestUnread } = await employeeSession.from("notifications").select("id").eq("company_id", companyId).is("read_at", null).order("created_at", { ascending: true }).limit(2);
  for (const row of oldestUnread ?? []) {
    const { error: readErr } = await employeeSession.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", row.id);
    if (readErr) throw new Error(`notifications mark-read: ${readErr.message}`);
  }
  log("notifications", "Test Employee — mark oldest as read", oldestUnread && oldestUnread.length > 0 ? "updated" : "skipped", `${oldestUnread?.length ?? 0} marked`);

  // ==========================================================================
  // Phase N — Employee Hourly Rates (Part 17/46) — current + 2 historical
  // periods for Test Employee, via companyAdminSession (company_admin
  // passes employee_hourly_rates_insert's RLS check). Idempotent: if a
  // rate history already exists for this employee (any row at all), the
  // whole block is skipped rather than trying to re-derive whether the
  // exact 3-period shape already matches — this fixture's rate history is
  // set once and never needs correcting on re-run.
  // ==========================================================================
  const { data: existingRateRows } = await companyAdminSession.from("employee_hourly_rates").select("id").eq("company_id", companyId).eq("employee_id", employeeEmployeeId).limit(1);
  if (existingRateRows && existingRateRows.length > 0) {
    log("employee-hourly-rates", "Test Employee", "reused", "history already exists");
  } else {
    const { error: rate1Err } = await companyAdminSession.from("employee_hourly_rates").insert({
      company_id: companyId, employee_id: employeeEmployeeId, hourly_rate: 15.5, currency: "EUR",
      effective_from: "2025-06-10", effective_to: "2025-12-31", reason: "TEST fixture: initial rate", changed_by: null,
    });
    if (rate1Err) throw new Error(`employee_hourly_rates insert (rate 1): ${rate1Err.message}`);
    const { error: rate2Err } = await companyAdminSession.from("employee_hourly_rates").insert({
      company_id: companyId, employee_id: employeeEmployeeId, hourly_rate: 17.0, currency: "EUR",
      effective_from: "2026-01-01", effective_to: "2026-05-31", reason: "TEST fixture: annual increase", changed_by: null,
    });
    if (rate2Err) throw new Error(`employee_hourly_rates insert (rate 2): ${rate2Err.message}`);
    const { error: rate3Err } = await companyAdminSession.from("employee_hourly_rates").insert({
      company_id: companyId, employee_id: employeeEmployeeId, hourly_rate: 18.5, currency: "EUR",
      effective_from: "2026-06-01", effective_to: null, reason: "TEST fixture: current rate", changed_by: null,
    });
    if (rate3Err) throw new Error(`employee_hourly_rates insert (rate 3): ${rate3Err.message}`);
    log("employee-hourly-rates", "Test Employee", "created", "3 periods (2 historical + 1 current)");
  }

  // ==========================================================================
  // Phase O — Pay Rules (Part 10-12) + Rate/Salary Review Requests (Part
  // 5-9). Pay rules match the task's own worked example exactly (Regular
  // base_only / Overtime +20% / Night +€2/h / Sunday +€3/h, all
  // stackable) — company-wide, via companyAdminSession (RLS: company_
  // admin/planner/platform_super_admin only). A worked-hours day on the
  // most recent past Sunday exercises overtime+night+Sunday stacking
  // together for the Estimated Earnings engine. Rate requests go through
  // the real self-service submit path (employeeSession, own employee
  // record only — mirrors submitRateRequest() exactly) then real
  // approve/reject RPC decisions, never a synthetic pre-decided insert.
  // ==========================================================================
  const { data: existingPayRules } = await companyAdminSession.from("pay_rules").select("id").eq("company_id", companyId).limit(1);
  if (existingPayRules && existingPayRules.length > 0) {
    log("pay-rules", "company pay rules", "reused", "already exist");
  } else {
    const payRuleRows = [
      { category: "regular", calculation_type: "base_only", value: 0 },
      { category: "overtime", calculation_type: "percentage_extra", value: 20 },
      { category: "night", calculation_type: "fixed_extra_per_hour", value: 2 },
      { category: "sunday", calculation_type: "fixed_extra_per_hour", value: 3 },
    ] as const;
    for (const rule of payRuleRows) {
      const { error } = await companyAdminSession.from("pay_rules").insert({
        company_id: companyId,
        category: rule.category,
        calculation_type: rule.calculation_type,
        value: rule.value,
        currency: "EUR",
        stackable: true,
        effective_from: "2026-01-01",
        created_by: null,
      });
      if (error) throw new Error(`pay_rules insert (${rule.category}): ${error.message}`);
    }
    log("pay-rules", "company pay rules", "created", "regular / overtime +20% / night +€2/h / sunday +€3/h");
  }

  function mostRecentPastSunday(minDaysAgo: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - minDaysAgo);
    while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  await ensureWorkedHours(
    companyAdminSession,
    companyId,
    projectId,
    employeeEmployeeId,
    mostRecentPastSunday(3),
    { regular: 8, overtime: 2, night: 4 },
    "Test Employee (Sunday premium stacking demo)",
  );

  async function ensureRateRequest(requestedRate: number | null, reason: string, finalStatus: "pending" | "approved" | "rejected"): Promise<void> {
    const { data: existing } = await companyAdminSession
      .from("employee_rate_requests")
      .select("id, status")
      .eq("company_id", companyId)
      .eq("employee_id", employeeEmployeeId)
      .eq("reason", reason)
      .maybeSingle();
    // A request already at its target final status (or genuinely meant to
    // stay pending) is fully reused. One that exists but is STILL pending
    // when it's supposed to have been decided (e.g. a prior run's
    // decision RPC call failed after the insert already committed) falls
    // through to the decision step below instead of being silently
    // skipped forever — true idempotency, not just "insert once."
    if (existing && (existing.status === finalStatus || finalStatus === "pending")) {
      log("rate-requests", reason, "reused", existing.status);
      return;
    }

    let id: string;
    if (existing) {
      id = existing.id;
    } else {
      const { data: currentRate } = await employeeSession.from("employee_hourly_rates").select("hourly_rate, currency").eq("company_id", companyId).eq("employee_id", employeeEmployeeId).is("effective_to", null).maybeSingle();
      const { data: inserted, error: insertErr } = await employeeSession
        .from("employee_rate_requests")
        .insert({
          company_id: companyId,
          employee_id: employeeEmployeeId,
          current_rate_at_request: currentRate?.hourly_rate ?? null,
          requested_rate: requestedRate,
          currency: currentRate?.currency ?? "EUR",
          reason,
        })
        .select("id")
        .single();
      if (insertErr) throw new Error(`employee_rate_requests insert (${reason}): ${insertErr.message}`);
      id = inserted.id as string;
    }

    if (finalStatus === "approved") {
      const { error } = await companyAdminSession.rpc("approve_employee_rate_request", {
        target_request_id: id,
        target_approved_rate: requestedRate ?? 19,
        target_effective_from: TOMORROW,
        target_decision_reason: "Approved — TEST fixture",
      });
      if (error) throw new Error(`approve_employee_rate_request (${reason}): ${error.message}`);
    } else if (finalStatus === "rejected") {
      const { error } = await companyAdminSession.rpc("reject_employee_rate_request", { target_request_id: id, target_decision_reason: "Rejected — TEST fixture, budget constraints this cycle" });
      if (error) throw new Error(`reject_employee_rate_request (${reason}): ${error.message}`);
    }
    log("rate-requests", reason, "created", finalStatus);
  }
  await ensureRateRequest(20, "TEST fixture: requesting a raise given added scaffold-inspection responsibilities", "pending");
  await ensureRateRequest(19, "TEST fixture: annual review — approved", "approved");
  await ensureRateRequest(null, "TEST fixture: review only, no specific amount requested — rejected", "rejected");

  // ==========================================================================
  // Phase P — Equipment stock adjustment (Part 26) — a real
  // adjust_equipment_stock() call against one of the existing quantity-
  // tracked catalog items, so the History tab has a genuine
  // 'stock_adjusted' entry to show (not just added/issued/returned).
  // ==========================================================================
  const { data: stockAdjustHistory } = await companyAdminSession.from("equipment_history").select("id").eq("company_id", companyId).eq("event", "stock_adjusted").limit(1);
  if (stockAdjustHistory && stockAdjustHistory.length > 0) {
    log("equipment-stock-adjustment", "quantity item", "reused", "already exists");
  } else {
    const { data: quantityItem } = await companyAdminSession.from("equipment_items").select("id").eq("company_id", companyId).eq("tracking_mode", "quantity").is("archived_at", null).limit(1).maybeSingle();
    if (quantityItem) {
      const { error } = await companyAdminSession.rpc("adjust_equipment_stock", { target_item_id: quantityItem.id, target_delta: 10, target_reason: "TEST fixture: new delivery" });
      if (error) throw new Error(`adjust_equipment_stock: ${error.message}`);
      log("equipment-stock-adjustment", "quantity item", "created", "+10 — new delivery");
    } else {
      log("equipment-stock-adjustment", "quantity item", "skipped", "no quantity-tracked catalog item found");
    }
  }

  // ==========================================================================
  // Phase Q — Active company/project context (Part 27's live smoke test
  // requirement). `profiles.active_company_id`/`active_project_id` are UX
  // preferences only, set by a real user's FIRST use of the company/
  // project switcher — a freshly-created fixture account has them null,
  // so any page scoped to "the active project" correctly renders empty
  // until that happens. A real, weeks-old-looking employee would already
  // have used the switcher at least once. Set every fixture employee's
  // context to the primary Role Validation company/project directly
  // (service-role — safe here since this table is documented as a UX
  // preference, not a security boundary, and this update is scoped to
  // companyId, which contains only TEST fixture employees).
  // ==========================================================================
  {
    const { data: fixtureProfileIds, error: profileIdsErr } = await admin.from("employees").select("profile_id").eq("company_id", companyId).not("profile_id", "is", null);
    if (profileIdsErr) throw new Error(`employees profile_id lookup: ${profileIdsErr.message}`);
    const ids = (fixtureProfileIds ?? []).map((r) => r.profile_id).filter((id): id is string => !!id);
    if (ids.length > 0) {
      const { error: activeContextErr, count: activeContextCount } = await admin
        .from("profiles")
        .update({ active_company_id: companyId, active_project_id: projectId }, { count: "exact" })
        .in("id", ids)
        .or(`active_company_id.is.null,active_company_id.neq.${companyId},active_project_id.is.null,active_project_id.neq.${projectId}`);
      if (activeContextErr) throw new Error(`profiles active-context update: ${activeContextErr.message}`);
      log("active-context", "fixture profiles -> TEST Role Validation Company/Project", activeContextCount ? "updated" : "reused", `${activeContextCount ?? 0}/${ids.length} changed`);
    }
  }

  console.log("\n=== PHASE A-P SUMMARY (FINAL) ===");
  const counts = report.reduce<Record<Action, number>>((acc, r) => ({ ...acc, [r.action]: (acc[r.action] ?? 0) + 1 }), { created: 0, reused: 0, skipped: 0, updated: 0 });
  console.log(counts);
  console.log("\nSecondary project id:", secondaryProjectId);
  console.log("Isolation Company B id:", companyBId, "project:", projectBId);
  console.log("Today's Team ids:", todayTeamIds);
  console.log("\nSupporting account credentials (for these extra fixtures only):");
  for (const a of SUPPORTING_ACCOUNTS) console.log(`  ${a.roleName} (extra) | ${a.email} | ${a.password}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("SEED FAILED:", err);
    process.exit(1);
  });
