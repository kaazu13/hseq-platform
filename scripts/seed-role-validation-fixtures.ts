/**
 * DEV-ONLY, disposable role-validation fixture seed.
 *
 * Creates exactly one dedicated *@example.test account per real, currently-
 * supported system role (inspected from the live `roles` table, never
 * invented), all inside one clearly-marked, brand-new fixture company/
 * project — "TEST — Role Validation Company" / "TEST — Role Validation
 * Project" — kept fully separate from every other company (Northstar,
 * Valutris, etc.) so role behavior can be compared on identical data.
 *
 * Idempotent (mirrors scripts/seed-test-company.ts's exact conventions):
 * every step checks for existing data first and reports created/reused.
 * NEVER touches cristi.3ddd@gmail.com or any other real account — this
 * script has no code path that can reference a non-@example.test email.
 *
 * STABLE CREDENTIALS (role-validation environment fix, 2026-08-16): every
 * fixture account's password is now a FIXED, deterministic, per-role value
 * (ROLE_FIXTURE_PASSWORDS below) — never regenerated randomly. This is
 * intentional and safe ONLY because (a) this script is dev/test tooling,
 * never imported by the Next.js app or shipped in any client bundle, (b)
 * `assertFixtureEmail()` hard-refuses any address that isn't
 * `test.<role>@example.test`, so these values can never reach a real
 * account, and (c) the accounts themselves hold zero real data. Do not
 * copy this pattern for anything that touches a real user.
 *
 * PRODUCTION SAFETY GUARD: refuses to run at all unless
 * ALLOW_ROLE_VALIDATION_SEED=true is set in the environment — see
 * assertSeedAllowed() below. This is a fail-closed gate, not a soft
 * warning; company-name matching alone is not trusted as a safety check.
 *
 * Run: ALLOW_ROLE_VALIDATION_SEED=true npx tsx scripts/seed-role-validation-fixtures.ts
 * (or, to also run the realistic-data companion script in one command:
 * ALLOW_ROLE_VALIDATION_SEED=true npm run seed:role-validation — this
 * runs THIS script first, then scripts/seed-role-validation-realistic-
 * data.ts, which expands the company/project this script creates into a
 * realistic, weeks-old-looking fixture. Run this script alone if you only
 * need the 11 role accounts normalized.)
 * Requires SUPABASE_SECRET_KEY in .env.local (never committed).
 * Credentials are printed to the console each run (stable, so this is
 * informational, not a one-time reveal) — never written to a file, log,
 * or committed anywhere by this script itself.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
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

const admin: AdminClient = createSupabaseClient<Database>(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Hard safety guard — this script must NEVER be able to touch a real
// account. Every email it creates/looks up is validated against this
// pattern before any auth/password operation runs.
const FIXTURE_EMAIL_PATTERN = /^test\.[a-z]+@example\.test$/;
function assertFixtureEmail(email: string) {
  if (!FIXTURE_EMAIL_PATTERN.test(email)) {
    throw new Error(`REFUSING to touch "${email}" — does not match the disposable fixture pattern test.<role>@example.test.`);
  }
}

// Production-safety guard (role-validation environment fix): this script
// performs bulk auth-user creation/password resets and must never run
// against a real environment by accident. Company-name matching alone is
// NOT trusted as a safety check (a real company could coincidentally be
// named similarly) — an explicit, deliberately-set env flag is required.
// Fails closed: no flag, no run, regardless of anything else about the
// environment.
function assertSeedAllowed() {
  if (process.env.ALLOW_ROLE_VALIDATION_SEED !== "true") {
    throw new Error(
      "REFUSING to run: ALLOW_ROLE_VALIDATION_SEED=true is not set. This script resets fixture account passwords and creates test data — " +
        "it must be run with an explicit opt-in. Run as: ALLOW_ROLE_VALIDATION_SEED=true npm run seed:role-validation",
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
const credentials: { role: string; email: string; password: string }[] = [];

const COMPANY_NAME = "TEST — Role Validation Company";
const COMPANY_SLUG = "test-role-validation";
const COMPANY_PREFIX = "TESTROLE";
const PROJECT_NAME = "TEST — Role Validation Project";
const PROJECT_CODE = "TEST-ROLE-01";
const TODAY = new Date().toISOString().slice(0, 10);

type RoleHolder = {
  roleName: string; // roles.name — must exist in the live catalogue, verified before use
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  positionTitle: string;
};

// Populated after inspecting the live role catalogue (see inspectRoleCatalogue()).
let ROLE_HOLDERS: RoleHolder[] = [];

// STABLE, per-role fixture passwords — deliberately fixed, never
// regenerated (see this file's header for why this is safe here). Easy to
// type, unique per role, meets the project's configured minimum password
// length. Every account here can ONLY ever be a test.<role>@example.test
// fixture (assertFixtureEmail enforces this before any password write).
const ROLE_FIXTURE_PASSWORDS: Record<string, string> = {
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

function fixturePasswordFor(roleName: string): string {
  const password = ROLE_FIXTURE_PASSWORDS[roleName];
  if (!password) {
    // A role exists in the live catalogue but has no assigned stable
    // password yet — fail loudly rather than silently falling back to a
    // random one (which would reintroduce the exact instability bug this
    // fix addresses).
    throw new Error(`No stable fixture password defined for role "${roleName}" — add one to ROLE_FIXTURE_PASSWORDS.`);
  }
  return password;
}

async function inspectRoleCatalogue(): Promise<string[]> {
  const { data, error } = await admin.from("roles").select("name").is("company_id", null).order("name");
  if (error) throw error;
  const names = (data ?? []).map((r) => r.name);
  console.log("\n=== Live role catalogue (system roles) ===");
  console.log(names.join(", "));
  return names;
}

function buildRoleHolders(catalogue: string[]): RoleHolder[] {
  const labelFor: Record<string, { first: string; last: string; title: string }> = {
    platform_super_admin: { first: "Platform", last: "Admin", title: "Platform Super Admin" },
    company_admin: { first: "Company", last: "Manager", title: "Company Manager" },
    operations_manager: { first: "Workforce", last: "Coordinator", title: "Workforce Coordinator" },
    project_manager: { first: "Project", last: "Manager", title: "Project Manager" },
    hseq_manager: { first: "HSE", last: "Manager", title: "HSE Manager" },
    hse_officer: { first: "HSE", last: "Officer", title: "HSE Officer" },
    foreman: { first: "Test", last: "Foreman", title: "Foreman" },
    inspector: { first: "Test", last: "Inspector", title: "Inspector" },
    planner: { first: "Test", last: "Planner", title: "Planner" },
    recruiter: { first: "Test", last: "Recruiter", title: "Recruiter" },
    employee: { first: "Test", last: "Employee", title: "Employee" },
  };

  return catalogue.map((roleName) => {
    const shortKey = roleName.replace(/_/g, "").toLowerCase();
    const meta = labelFor[roleName] ?? { first: "Test", last: roleName, title: roleName };
    return {
      roleName,
      email: `test.${shortKey}@example.test`,
      fullName: `${meta.first} ${meta.last} (TEST)`,
      firstName: meta.first,
      lastName: `${meta.last} (TEST)`,
      positionTitle: meta.title,
    };
  });
}

async function ensureCompany(): Promise<string> {
  const { data: existing, error } = await admin.from("companies").select("id").eq("slug", COMPANY_SLUG).maybeSingle();
  if (error) throw error;
  if (existing) {
    log("company", COMPANY_NAME, "reused", existing.id);
    return existing.id;
  }
  const { data, error: insErr } = await admin.from("companies").insert({ name: COMPANY_NAME, slug: COMPANY_SLUG, employee_number_prefix: COMPANY_PREFIX, status: "active" }).select("id").single();
  if (insErr) throw insErr;
  log("company", COMPANY_NAME, "created", data.id);
  return data.id;
}

async function ensureProject(companyId: string): Promise<string> {
  const { data: existing, error } = await admin.from("projects").select("id").eq("company_id", companyId).eq("code", PROJECT_CODE).maybeSingle();
  if (error) throw error;
  if (existing) {
    log("project", PROJECT_NAME, "reused", existing.id);
    return existing.id;
  }
  const { data, error: insErr } = await admin
    .from("projects")
    .insert({ company_id: companyId, name: PROJECT_NAME, code: PROJECT_CODE, status: "active", client_name: "TEST Fixture Client", location: "TEST Fixture Site", start_date: TODAY })
    .select("id")
    .single();
  if (insErr) throw insErr;
  log("project", PROJECT_NAME, "created", data.id);
  return data.id;
}

async function ensureAuthUser(email: string, fullName: string, roleName: string, roleLabel: string): Promise<{ id: string; password: string | null }> {
  assertFixtureEmail(email);
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw listErr;
  const found = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  const password = fixturePasswordFor(roleName);

  if (found) {
    // Normalize rather than duplicate: reset to the STABLE fixture
    // password (never a fresh random one — see this file's header),
    // ensure it's confirmed/active, and explicitly clear any ban so a
    // previous failed run (or manual testing) can never leave this
    // account permanently locked out.
    const wasBanned = Boolean(found.banned_until) && new Date(found.banned_until as string).getTime() > Date.now();
    const { error: updErr } = await admin.auth.admin.updateUserById(found.id, {
      password,
      email_confirm: true,
      ban_duration: "none",
      user_metadata: { full_name: fullName, seed_source: "role-validation-fixtures" },
    });
    if (updErr) throw updErr;
    credentials.push({ role: roleLabel, email, password });
    log("auth-user", email, "updated", `normalized password + confirmed${wasBanned ? " + unbanned" : ""}`);
    console.log(`  CREDENTIAL: ${roleLabel} | ${email} | ${password}`);
    return { id: found.id, password };
  }

  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName, seed_source: "role-validation-fixtures" } });
  if (error || !data.user) throw error ?? new Error(`createUser returned no user for ${email}`);
  credentials.push({ role: roleLabel, email, password });
  log("auth-user", email, "created", data.user.id);
  console.log(`  CREDENTIAL: ${roleLabel} | ${email} | ${password}`);
  return { id: data.user.id, password };
}

async function waitForProfile(userId: string, fullName: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data } = await admin.from("profiles").select("id, full_name, account_status").eq("id", userId).maybeSingle();
    if (data) {
      const updates: Database["public"]["Tables"]["profiles"]["Update"] = {};
      if (data.full_name !== fullName) updates.full_name = fullName;
      if (data.account_status !== "active") updates.account_status = "active";
      if (Object.keys(updates).length > 0) await admin.from("profiles").update(updates).eq("id", userId);
      return;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`profiles row for ${userId} never appeared`);
}

async function ensureMembership(companyId: string, userId: string, email: string): Promise<string> {
  const { data: existing } = await admin.from("company_memberships").select("id, status").eq("company_id", companyId).eq("user_id", userId).maybeSingle();
  if (existing) {
    if (existing.status !== "active") {
      await admin.from("company_memberships").update({ status: "active" }).eq("id", existing.id);
      log("membership", email, "updated", "reactivated");
    } else {
      log("membership", email, "reused", existing.id);
    }
    return existing.id;
  }
  const { data, error } = await admin.from("company_memberships").insert({ company_id: companyId, user_id: userId, status: "active", joined_at: new Date().toISOString() }).select("id").single();
  if (error) throw error;
  log("membership", email, "created", data.id);
  return data.id;
}

async function ensureExactMembershipRole(companyId: string, membershipId: string, roleName: string, email: string) {
  const { data: role, error: roleErr } = await admin.from("roles").select("id").eq("name", roleName).is("company_id", null).single();
  if (roleErr || !role) throw roleErr ?? new Error(`role ${roleName} not found`);

  // Remove any OTHER role this membership might already hold, so each
  // fixture account holds EXACTLY the one role it's meant to test — "no
  // accidental extra roles are inherited."
  const { data: currentRoles } = await admin.from("membership_roles").select("id, role_id").eq("membership_id", membershipId);
  for (const row of currentRoles ?? []) {
    if (row.role_id !== role.id) {
      await admin.from("membership_roles").delete().eq("id", row.id);
      log("membership-role", `${email} (removed stray role)`, "updated");
    }
  }

  const alreadyHasIt = (currentRoles ?? []).some((r) => r.role_id === role.id);
  if (alreadyHasIt) {
    log("membership-role", `${email} -> ${roleName}`, "reused");
    return;
  }
  const { error } = await admin.from("membership_roles").insert({ company_id: companyId, membership_id: membershipId, role_id: role.id });
  if (error) throw error;
  log("membership-role", `${email} -> ${roleName}`, "created");
}

async function ensureEmployee(companyId: string, roleHolder: RoleHolder, profileId: string): Promise<{ id: string; employeeNumber: string }> {
  const workEmail = roleHolder.email; // reuse the login email as work_email too — clearly a fixture either way
  const { data: existing } = await admin.from("employees").select("id, employee_number, profile_id").eq("company_id", companyId).eq("work_email", workEmail).maybeSingle();
  if (existing) {
    if (existing.profile_id !== profileId) {
      await admin.from("employees").update({ profile_id: profileId }).eq("id", existing.id);
      log("employee", roleHolder.fullName, "updated", "linked profile_id");
    } else {
      log("employee", roleHolder.fullName, "reused", existing.employee_number);
    }
    return { id: existing.id, employeeNumber: existing.employee_number };
  }

  const { data: employeeNumber, error: numErr } = await admin.rpc("allocate_employee_number", { target_org_id: companyId });
  if (numErr || !employeeNumber) throw numErr ?? new Error("allocate_employee_number returned nothing");

  const { data, error } = await admin
    .from("employees")
    .insert({
      company_id: companyId,
      employee_number: employeeNumber,
      first_name: roleHolder.firstName,
      last_name: roleHolder.lastName,
      work_email: workEmail,
      position_title: roleHolder.positionTitle,
      employment_status: "active",
      start_date: TODAY,
      profile_id: profileId,
    })
    .select("id, employee_number")
    .single();
  if (error) throw error;
  log("employee", roleHolder.fullName, "created", data.employee_number);
  return { id: data.id, employeeNumber: data.employee_number };
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

async function ensureStaticTeamWithForeman(companyId: string, projectId: string, foremanEmployeeId: string): Promise<string> {
  const teamName = "TEST Static Team";
  const { data: existingTeam } = await admin.from("teams").select("id").eq("project_id", projectId).eq("name", teamName).maybeSingle();
  let teamId: string;
  if (existingTeam) {
    log("team", teamName, "reused", existingTeam.id);
    teamId = existingTeam.id;
  } else {
    const { data, error } = await admin.from("teams").insert({ company_id: companyId, project_id: projectId, name: teamName, code: "TST-01", color: "blue", status: "active", display_order: 1 }).select("id").single();
    if (error) throw error;
    log("team", teamName, "created", data.id);
    teamId = data.id;
  }

  const { data: existingAssignment } = await admin
    .from("team_assignments")
    .select("id")
    .eq("project_id", projectId)
    .eq("employee_id", foremanEmployeeId)
    .eq("assignment_role", "foreman")
    .is("end_at", null)
    .maybeSingle();
  if (existingAssignment) {
    log("team-assignment", "Test Foreman -> TEST Static Team", "reused");
  } else {
    const { error } = await admin.from("team_assignments").insert({ company_id: companyId, project_id: projectId, team_id: teamId, employee_id: foremanEmployeeId, assignment_role: "foreman", start_at: new Date().toISOString() });
    if (error) throw error;
    log("team-assignment", "Test Foreman -> TEST Static Team", "created");
  }
  return teamId;
}

async function ensureEmployeeAsTeamMember(companyId: string, projectId: string, employeeId: string, label: string) {
  const { data: existing } = await admin.from("project_assignments").select("id").eq("project_id", projectId).eq("employee_id", employeeId).eq("assignment_role", "member").is("end_at", null).maybeSingle();
  if (existing) {
    log("project-assignment", `${label} -> member`, "reused");
    return;
  }
  const { error } = await admin.from("project_assignments").insert({ company_id: companyId, project_id: projectId, employee_id: employeeId, assignment_role: "member" });
  if (error) throw error;
  log("project-assignment", `${label} -> member`, "created");
}

async function ensurePlatformSuperAdmin(userId: string, email: string) {
  assertFixtureEmail(email);
  const { data: existing } = await admin.from("platform_super_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (existing) {
    log("platform-super-admin", email, "reused");
    return;
  }
  // KNOWN LIMITATION (documented in project memory): the
  // platform_super_admins table has no INSERT grant even for service_role
  // (confirmed live — "GRANT INSERT ON public.platform_super_admins TO
  // service_role" is the exact hint Postgres returns). This step cannot
  // complete from this script; it is done as a separate, explicit
  // `supabase db query --linked` step immediately after this script runs,
  // using the exact same bootstrap-mirroring statement documented there.
  log("platform-super-admin", email, "skipped", `service_role lacks INSERT grant on platform_super_admins — grant manually via 'npx supabase db query --linked' for user_id ${userId}`);
}

async function main() {
  assertSeedAllowed();
  console.log(`=== Role-Validation Fixture Seed — ${new Date().toISOString()} ===\n`);

  const catalogue = await inspectRoleCatalogue();
  ROLE_HOLDERS = buildRoleHolders(catalogue);

  const companyId = await ensureCompany();
  const projectId = await ensureProject(companyId);

  const employeeIdByRole = new Map<string, string>();
  const profileIdByRole = new Map<string, string>();

  for (const holder of ROLE_HOLDERS) {
    const { id: userId } = await ensureAuthUser(holder.email, holder.fullName, holder.roleName, holder.roleName);
    await waitForProfile(userId, holder.fullName);
    profileIdByRole.set(holder.roleName, userId);

    if (holder.roleName === "platform_super_admin") {
      // Platform Super Admin is intentionally NOT given a company
      // membership/employee record — "Company: —, Project: —" by design;
      // its authority is global, not company-scoped.
      await ensurePlatformSuperAdmin(userId, holder.email);
      continue;
    }

    const membershipId = await ensureMembership(companyId, userId, holder.email);
    await ensureExactMembershipRole(companyId, membershipId, holder.roleName, holder.email);
    const employee = await ensureEmployee(companyId, holder, userId);
    employeeIdByRole.set(holder.roleName, employee.id);
  }

  // Project-scoped assignments — only for roles project_assignment_role actually supports.
  const pmEmployeeId = employeeIdByRole.get("project_manager");
  if (pmEmployeeId) await ensureProjectAssignment(companyId, projectId, pmEmployeeId, "project_manager", "Test Project Manager");
  const hseqEmployeeId = employeeIdByRole.get("hseq_manager");
  if (hseqEmployeeId) await ensureProjectAssignment(companyId, projectId, hseqEmployeeId, "hseq_manager", "Test HSE Manager");
  const hseOfficerEmployeeId = employeeIdByRole.get("hse_officer");
  if (hseOfficerEmployeeId) await ensureProjectAssignment(companyId, projectId, hseOfficerEmployeeId, "hse_officer", "Test HSE Officer");
  const inspectorEmployeeId = employeeIdByRole.get("inspector");
  if (inspectorEmployeeId) await ensureProjectAssignment(companyId, projectId, inspectorEmployeeId, "inspector", "Test Inspector");
  const employeeEmployeeId = employeeIdByRole.get("employee");
  if (employeeEmployeeId) await ensureEmployeeAsTeamMember(companyId, projectId, employeeEmployeeId, "Test Employee");

  const foremanEmployeeId = employeeIdByRole.get("foreman");
  if (!foremanEmployeeId) throw new Error("No 'foreman' role found in the live catalogue — cannot build foreman-dependent fixtures.");
  await ensureStaticTeamWithForeman(companyId, projectId, foremanEmployeeId);
  // Part 15 fixture-quality fix: Test Foreman previously had ONLY the
  // older static team_assignments row above — no project_assignments row
  // at all (project_assignment_role has no 'foreman' value; 'member' is
  // the closest fit, same as Test Employee's own row). Without one,
  // is_project_teammate() (the authorization check inside
  // get_basic_employee_info(), the one sanctioned channel for resolving a
  // teammate's display name) never matched Test Employee<->Test Foreman —
  // confirmed live: their name silently failed to resolve, so Today's
  // Team's "Foreman" line rendered nothing even once daily_teams.
  // foreman_employee_id itself was correctly set (see this run's report).
  await ensureProjectAssignment(companyId, projectId, foremanEmployeeId, "member", "Test Foreman");

  // NOTE: daily_teams/daily_team_members/scaffolds/lmra_assessments/
  // scaffold_inspections/safety_observations/equipment_items fixture rows
  // are intentionally NOT created here — service_role lacks SELECT/INSERT
  // grants on all of these tables (same documented limitation as
  // platform_super_admins above), confirmed live. They were created once,
  // successfully, via a single `supabase db query --linked --file` run
  // scoped to this exact company/project id — see this run's own final
  // report for the one-time SQL used. This script remains safely re-
  // runnable for the auth/membership/employee/role layer only.
  //
  // Second Employee-role correction pass, Part 15 (fixture quality only,
  // same one-time `supabase db query --linked --file` mechanism, run once
  // more): fixed the original TEST Today's Team's `daily_teams.
  // foreman_employee_id` (was null — the fixture's one-time creation only
  // ever wrote the OLDER daily_team_members role='foreman' row, predating
  // the foreman_employee_id column the app actually reads from, which is
  // why the team card showed "No Foreman Assigned") to Test Foreman's
  // employee id; and added a second daily_teams row ("TEST Second Team
  // (negative-visibility fixture)", same project/date, a different worker
  // — Test Recruiter — and no foreman, since validate_daily_team_
  // foreman_eligibility requires foreman_employee_id to reference an
  // employee who genuinely holds the foreman role on this project, and
  // this fixture company has only one such account) specifically so
  // Employee-role visibility tests have a real "another team I must NOT
  // see" fixture to assert against, not just the one team they're on.

  console.log("\n=== SUMMARY ===");
  const counts = report.reduce<Record<Action, number>>((acc, r) => ({ ...acc, [r.action]: (acc[r.action] ?? 0) + 1 }), { created: 0, reused: 0, skipped: 0, updated: 0 });
  console.log(counts);

  console.log("\n=== CREDENTIALS (shown once, never stored) ===");
  console.log("ROLE | EMAIL | TEMP PASSWORD");
  for (const c of credentials) {
    console.log(`${c.role} | ${c.email} | ${c.password}`);
  }

  console.log(`\nCompany ID: ${companyId}`);
  console.log(`Project ID: ${projectId}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("SEED FAILED:", err);
    process.exit(1);
  });
