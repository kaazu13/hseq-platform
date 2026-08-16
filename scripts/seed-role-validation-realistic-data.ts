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

    for (const workerKey of spec.workerKeys) {
      const employeeId = employeeIdByKey[workerKey];
      if (!employeeId) throw new Error(`Unknown worker key "${workerKey}" for team ${spec.name}`);
      const { error: moveErr } = await adminSession.rpc("move_daily_team_member", { target_project_id: projectId, target_work_date: workDate, target_daily_team_id: dailyTeamId, target_employee_id: employeeId, target_role: "member" });
      if (moveErr) throw new Error(`move_daily_team_member(${workerKey} -> ${spec.name}, ${workDate}): ${moveErr.message}`);
    }
    log("daily-team-members", `${spec.name} (${workDate})`, "created", `${spec.workerKeys.length} workers`);
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
  } else {
    const { data, error } = await spec.session
      .from("scaffolds")
      .insert({
        company_id: spec.companyId,
        project_id: spec.projectId,
        tag_number: spec.tagNumber,
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
  const { data: existingRows } = await spec.session.from("equipment_items").select("id").eq("company_id", spec.companyId).eq("name", spec.name).limit(1);
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

async function main() {
  assertSeedAllowed();
  console.log(`=== Role-Validation REALISTIC DATA Seed — ${new Date().toISOString()} ===\n`);

  const { companyId, projectId, employeeIdByEmail } = await resolveCoreFixtures();
  console.log(`Company: ${companyId}\nProject: ${projectId}\n`);

  const { data: staticTeam, error: staticTeamErr } = await admin.from("teams").select("id").eq("project_id", projectId).eq("name", "TEST Static Team").maybeSingle();
  if (staticTeamErr) throw staticTeamErr;
  if (!staticTeam) throw new Error('"TEST Static Team" not found — run seed-role-validation-fixtures.ts first.');
  const staticTeamId = staticTeam.id;

  // --- Phase B: supporting accounts (2 extra foremen, 1 suspended member) ---
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

  const employeeIdByKey: Record<string, string> = {
    employee: employeeIdByEmail.get("test.employee@example.test")!,
    foreman: employeeIdByEmail.get("test.foreman@example.test")!,
    foreman2: supportingEmployeeIdByRole["test.foreman2@example.test"],
    foreman3: supportingEmployeeIdByRole["test.foreman3@example.test"],
    ...Object.fromEntries(Object.entries(plainEmployeeIdByKey)),
  };

  const TEAM_SPECS: TeamSpec[] = [
    { key: "alpha", foremanEmail: "test.foreman@example.test", foremanEmployeeId: employeeIdByKey.foreman, name: "TEST Team Alpha", shift: "day", workArea: "North Platform", activity: "Scaffold erection", workerKeys: ["employee", "worker01", "worker02", "worker03", "worker04"] },
    { key: "bravo", foremanEmail: "test.foreman2@example.test", foremanEmployeeId: employeeIdByKey.foreman2, name: "TEST Team Bravo", shift: "day", workArea: "South Platform", activity: "Pipe insulation", workerKeys: ["worker05", "worker06", "worker07", "worker08"] },
    { key: "charlie", foremanEmail: "test.foreman3@example.test", foremanEmployeeId: employeeIdByKey.foreman3, name: "TEST Team Charlie", shift: "night", workArea: "Tank Farm", activity: "Electrical maintenance", workerKeys: ["worker09", "worker10", "worker11", "worker12"] },
  ];

  const todayTeamIds = await ensureDailyTeamsForDate(companyAdminSession, companyId, projectId, TODAY, TEAM_SPECS, employeeIdByKey);

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
    const { error: confirmErr } = await companyAdminSession.rpc("confirm_absence_report", { target_report_id: (report as { id: string }).id });
    if (confirmErr) throw new Error(`confirm_absence_report: ${confirmErr.message}`);
    log("absence-report", `Test Employee (${isoDate(3)})`, "updated", "confirmed");
  }

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
  for (const key of ["worker05", "worker06", "worker07", "worker08", "worker09", "worker10", "worker11", "worker12"]) {
    await ensureWorkedHours(companyAdminSession, companyId, projectId, plainEmployeeIdByKey[key], TODAY, { regular: 8 }, key);
  }

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
    dailyTeamId: todayTeamIds.alpha,
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
    dailyTeamId: historicalAlphaTeam?.id ?? null,
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
  const hiVisId = await ensureEquipmentItem({ session: companyAdminSession, companyId, projectId, trackingMode: "quantity", category: "PPE", name: "Hi-Vis Vest", quantity: 40 });
  await ensureEquipmentItem({ session: companyAdminSession, companyId, projectId, trackingMode: "quantity", category: "PPE", name: "Gloves", quantity: 60 });
  await ensureEquipmentItem({ session: companyAdminSession, companyId, projectId, trackingMode: "quantity", category: "PPE", name: "Safety Glasses", quantity: 40 });
  const srlId = await ensureEquipmentItem({ session: companyAdminSession, companyId, projectId, trackingMode: "serialized", category: "Fall Protection", name: "SRL (Self-Retracting Lifeline)", defaultValidityDays: 1825 });
  const gasDetectorId = await ensureEquipmentItem({ session: companyAdminSession, companyId, projectId, trackingMode: "serialized", category: "Gas Detection", name: "Gas Detector", defaultValidityDays: 365 });
  await ensureEquipmentItem({ session: companyAdminSession, companyId, projectId, trackingMode: "serialized", category: "Radio / Communication", name: "Radio" });
  const toolBagId = await ensureEquipmentItem({ session: companyAdminSession, companyId, projectId, trackingMode: "serialized", category: "Hand Tool", name: "Tool Bag" });
  await ensureEquipmentItem({ session: companyAdminSession, companyId, projectId, trackingMode: "serialized", category: "Power Tool", name: "Cordless Drill" });

  async function ensureIssuance(itemId: string, employeeId: string, issuedAtDaysAgo: number, expiresAt: string | undefined, useDefault: boolean, label: string) {
    const { data: existingRows } = await companyAdminSession.from("equipment_assignments").select("id").eq("company_id", companyId).eq("equipment_item_id", itemId).eq("employee_id", employeeId).eq("status", "active").limit(1);
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

  console.log("\n=== PHASE A-M SUMMARY (FINAL) ===");
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
