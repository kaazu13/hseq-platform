/**
 * Idempotent dev/test-data seed for "Northstar Scaffolding Test AB".
 *
 * Populates a clearly-named, clearly-scoped test company with realistic
 * staff, roles, projects, teams, and assignments so the app can be exercised
 * as real users would use it, without touching any other company
 * (Valutris included). Safe to re-run: every step checks for existing data
 * before creating anything and reports created/reused/skipped.
 *
 * Uses the service-role ("secret key") client (lib/supabase/admin.ts) — the
 * documented, intended mechanism for this class of operation (see
 * supabase/migrations/20260725090100_companies.sql: "Created only via a
 * service-role/manual operation") and for creating auth users via the
 * Supabase Admin API (supabase.auth.admin.createUser), since no
 * invitation/sign-up flow exists yet in this codebase to reuse.
 *
 * Run: npm run seed:test-company
 * Requires SUPABASE_SECRET_KEY in .env.local (never committed).
 *
 * Never stores passwords anywhere persistent — freshly generated passwords
 * for newly-created test accounts are printed once to the console at the
 * end of the run and nowhere else.
 */
import { randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

type AdminClient = ReturnType<typeof createSupabaseClient<Database>>;

// ── env loading (standalone script — no Next.js runtime to load .env.local for us) ──
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

const admin: AdminClient = createSupabaseClient<Database>(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SECRET_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ── reporting ──────────────────────────────────────────────────────────
type Action = "created" | "reused" | "skipped" | "updated";
const report: { section: string; item: string; action: Action; detail?: string }[] = [];
function log(section: string, item: string, action: Action, detail?: string) {
  report.push({ section, item, action, detail });
  const tag = { created: "+ created", reused: "= reused", skipped: "- skipped", updated: "~ updated" }[action];
  console.log(`[${section}] ${tag}: ${item}${detail ? ` (${detail})` : ""}`);
}
const newCredentials: { email: string; password: string; role: string }[] = [];

// ── constants ──────────────────────────────────────────────────────────
const COMPANY_NAME = "Northstar Scaffolding Test AB";
const COMPANY_SLUG = "northstar-scaffolding-test";
const COMPANY_PREFIX = "NORTHSTARTEST"; // uppercase letters/digits only — companies_employee_number_prefix_format
const MY_ACCOUNT_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "cristi.3ddd@gmail.com";

type RoleHolder = {
  key: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  roleName: string; // roles.name
  positionTitle: string;
  startDate: string;
};

const ROLE_HOLDERS: RoleHolder[] = [
  { key: "cm", email: "northstar.cm@example.com", fullName: "Erik Lindqvist", firstName: "Erik", lastName: "Lindqvist", roleName: "company_admin", positionTitle: "Company Manager", startDate: "2024-02-01" },
  { key: "wc", email: "northstar.wc@example.com", fullName: "Maria Söderberg", firstName: "Maria", lastName: "Söderberg", roleName: "operations_manager", positionTitle: "Workforce Coordinator", startDate: "2024-03-10" },
  { key: "pm", email: "northstar.pm@example.com", fullName: "Johan Berg", firstName: "Johan", lastName: "Berg", roleName: "project_manager", positionTitle: "Project Manager", startDate: "2024-04-15" },
  { key: "hseq", email: "northstar.hseq@example.com", fullName: "Anna Nilsson", firstName: "Anna", lastName: "Nilsson", roleName: "hseq_manager", positionTitle: "HSE Manager", startDate: "2024-04-15" },
  { key: "foreman1", email: "northstar.foreman1@example.com", fullName: "Karl Andersson", firstName: "Karl", lastName: "Andersson", roleName: "foreman", positionTitle: "Foreman", startDate: "2024-05-01" },
  { key: "foreman2", email: "northstar.foreman2@example.com", fullName: "Peter Karlsson", firstName: "Peter", lastName: "Karlsson", roleName: "foreman", positionTitle: "Foreman", startDate: "2024-05-01" },
  { key: "hse1", email: "northstar.hse1@example.com", fullName: "Sara Olsson", firstName: "Sara", lastName: "Olsson", roleName: "hse_officer", positionTitle: "HSE Officer", startDate: "2024-06-01" },
  { key: "hse2", email: "northstar.hse2@example.com", fullName: "Lars Johansson", firstName: "Lars", lastName: "Johansson", roleName: "hse_officer", positionTitle: "HSE Officer", startDate: "2024-06-01" },
  { key: "inspector1", email: "northstar.inspector1@example.com", fullName: "Emma Gustafsson", firstName: "Emma", lastName: "Gustafsson", roleName: "inspector", positionTitle: "Inspector", startDate: "2024-06-15" },
  { key: "inspector2", email: "northstar.inspector2@example.com", fullName: "Oskar Persson", firstName: "Oskar", lastName: "Persson", roleName: "inspector", positionTitle: "Inspector", startDate: "2024-06-15" },
  { key: "planner", email: "northstar.planner@example.com", fullName: "Linda Eriksson", firstName: "Linda", lastName: "Eriksson", roleName: "planner", positionTitle: "Planner", startDate: "2024-07-01" },
  { key: "recruiter", email: "northstar.recruiter@example.com", fullName: "Mikael Svensson", firstName: "Mikael", lastName: "Svensson", roleName: "recruiter", positionTitle: "Recruiter", startDate: "2024-07-01" },
];

type GeneralEmployee = {
  key: string;
  firstName: string;
  lastName: string;
  startDate: string;
  terminated?: { endDate: string; reason: Database["public"]["Enums"]["employment_end_reason"] };
};

const GENERAL_EMPLOYEES: GeneralEmployee[] = [
  { key: "emp01", firstName: "Anders", lastName: "Holm", startDate: "2024-08-01" },
  { key: "emp02", firstName: "Björn", lastName: "Ström", startDate: "2024-08-01" },
  { key: "emp03", firstName: "Cecilia", lastName: "Dahl", startDate: "2024-08-15" },
  { key: "emp04", firstName: "David", lastName: "Ekström", startDate: "2024-09-01" },
  { key: "emp05", firstName: "Elin", lastName: "Forsberg", startDate: "2024-09-01" },
  { key: "emp06", firstName: "Fredrik", lastName: "Hedlund", startDate: "2024-10-01" },
  { key: "emp07", firstName: "Greta", lastName: "Isaksson", startDate: "2024-10-01" },
  { key: "emp08", firstName: "Henrik", lastName: "Jonsson", startDate: "2024-05-01", terminated: { endDate: "2025-11-30", reason: "resigned" } },
  { key: "emp09", firstName: "Ida", lastName: "Karlström", startDate: "2024-11-01" },
  { key: "emp10", firstName: "Jakob", lastName: "Lundqvist", startDate: "2024-06-01", terminated: { endDate: "2025-09-15", reason: "end_of_contract" } },
];

function workEmailFor(firstName: string, lastName: string): string {
  const slug = `${firstName}-${lastName}`.toLowerCase().replace(/[^a-z0-9-]/g, "");
  return `northstar-test.${slug}@example.com`;
}

function generatePassword(): string {
  return randomBytes(12).toString("base64url");
}

// ── generic helpers ────────────────────────────────────────────────────

async function ensureCompany() {
  const { data: existing, error: selErr } = await admin
    .from("companies")
    .select("id, name, slug")
    .eq("slug", COMPANY_SLUG)
    .maybeSingle();
  if (selErr) throw selErr;

  if (existing) {
    log("company", COMPANY_NAME, "reused", existing.id);
    return existing.id;
  }

  const { data, error } = await admin
    .from("companies")
    .insert({ name: COMPANY_NAME, slug: COMPANY_SLUG, employee_number_prefix: COMPANY_PREFIX, status: "active" })
    .select("id")
    .single();
  if (error) throw error;
  log("company", COMPANY_NAME, "created", data.id);
  return data.id;
}

async function ensureAuthUser(email: string, fullName: string, roleLabel: string): Promise<string> {
  // Look for an existing auth user with this email first — createUser fails
  // loudly on a duplicate, and re-running the seed must not error out.
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw listErr;
  const found = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (found) {
    log("auth-user", email, "reused", found.id);
    return found.id;
  }

  const password = generatePassword();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, seed_source: "northstar-test-company" },
  });
  if (error || !data.user) throw error ?? new Error(`createUser returned no user for ${email}`);

  newCredentials.push({ email, password, role: roleLabel });
  log("auth-user", email, "created", data.user.id);
  return data.user.id;
}

async function waitForProfile(userId: string, fullName: string): Promise<void> {
  // handle_new_user() creates the profile row via an AFTER INSERT trigger on
  // auth.users — should be immediate, but poll briefly rather than assume.
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data } = await admin.from("profiles").select("id, full_name").eq("id", userId).maybeSingle();
    if (data) {
      if (data.full_name !== fullName) {
        await admin.from("profiles").update({ full_name: fullName }).eq("id", userId);
      }
      return;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`profiles row for ${userId} never appeared — handle_new_user() trigger may not have fired`);
}

async function ensureMembership(companyId: string, userId: string, email: string): Promise<string> {
  const { data: existing } = await admin
    .from("company_memberships")
    .select("id, status")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    if (existing.status !== "active") {
      await admin.from("company_memberships").update({ status: "active" }).eq("id", existing.id);
      log("membership", email, "updated", "reactivated");
    } else {
      log("membership", email, "reused", existing.id);
    }
    return existing.id;
  }

  const { data, error } = await admin
    .from("company_memberships")
    .insert({ company_id: companyId, user_id: userId, status: "active", joined_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error) throw error;
  log("membership", email, "created", data.id);
  return data.id;
}

async function ensureMembershipRole(companyId: string, membershipId: string, roleName: string, email: string) {
  const { data: role, error: roleErr } = await admin.from("roles").select("id").eq("name", roleName).single();
  if (roleErr || !role) throw roleErr ?? new Error(`role ${roleName} not found — is supabase/seed.sql's role catalogue applied?`);

  const { data: existing } = await admin
    .from("membership_roles")
    .select("id")
    .eq("membership_id", membershipId)
    .eq("role_id", role.id)
    .maybeSingle();

  if (existing) {
    log("membership-role", `${email} -> ${roleName}`, "reused");
    return;
  }

  const { error } = await admin
    .from("membership_roles")
    .insert({ company_id: companyId, membership_id: membershipId, role_id: role.id });
  if (error) throw error;
  log("membership-role", `${email} -> ${roleName}`, "created");
}

type EmployeeInsert = {
  companyId: string;
  firstName: string;
  lastName: string;
  positionTitle: string;
  startDate: string;
  workEmail: string;
  profileId?: string;
  createdBy?: string | null;
};

async function ensureEmployee(input: EmployeeInsert): Promise<{ id: string; employeeNumber: string }> {
  const { data: existing } = await admin
    .from("employees")
    .select("id, employee_number, profile_id")
    .eq("company_id", input.companyId)
    .eq("work_email", input.workEmail)
    .maybeSingle();

  if (existing) {
    if (input.profileId && existing.profile_id !== input.profileId) {
      await admin.from("employees").update({ profile_id: input.profileId }).eq("id", existing.id);
      log("employee", `${input.firstName} ${input.lastName}`, "updated", "linked profile_id");
    } else {
      log("employee", `${input.firstName} ${input.lastName}`, "reused", existing.employee_number);
    }
    return { id: existing.id, employeeNumber: existing.employee_number };
  }

  const { data: employeeNumber, error: numErr } = await admin.rpc("allocate_employee_number", {
    target_org_id: input.companyId,
  });
  if (numErr || !employeeNumber) throw numErr ?? new Error("allocate_employee_number returned nothing");

  const { data, error } = await admin
    .from("employees")
    .insert({
      company_id: input.companyId,
      employee_number: employeeNumber,
      first_name: input.firstName,
      last_name: input.lastName,
      work_email: input.workEmail,
      position_title: input.positionTitle,
      employment_status: "active", // overwritten immediately by the employment-period sync trigger
      start_date: input.startDate,
      profile_id: input.profileId ?? null,
      created_by: input.createdBy ?? null,
      updated_by: input.createdBy ?? null,
    })
    .select("id, employee_number")
    .single();
  if (error) throw error;
  log("employee", `${input.firstName} ${input.lastName}`, "created", data.employee_number);
  return { id: data.id, employeeNumber: data.employee_number };
}

async function ensureTerminated(
  employeeId: string,
  companyId: string,
  name: string,
  endDate: string,
  reason: Database["public"]["Enums"]["employment_end_reason"],
) {
  const { data: openPeriod } = await admin
    .from("employee_employment_periods")
    .select("id, end_date")
    .eq("employee_id", employeeId)
    .is("end_date", null)
    .maybeSingle();

  if (!openPeriod) {
    log("employment", name, "skipped", "already terminated (no open period)");
    return;
  }

  const { error } = await admin
    .from("employee_employment_periods")
    .update({ end_date: endDate, end_reason: reason, ended_at: new Date().toISOString() })
    .eq("id", openPeriod.id);
  if (error) throw error;
  log("employment", name, "updated", `terminated (${reason}, ${endDate})`);
  void companyId;
}

async function ensureProject(
  companyId: string,
  name: string,
  code: string,
  status: Database["public"]["Enums"]["project_status"],
  clientName: string,
  location: string,
  startDate: string,
  createdBy: string | null,
): Promise<string> {
  const { data: existing } = await admin
    .from("projects")
    .select("id")
    .eq("company_id", companyId)
    .eq("code", code)
    .maybeSingle();
  if (existing) {
    log("project", name, "reused", existing.id);
    return existing.id;
  }

  const { data, error } = await admin
    .from("projects")
    .insert({
      company_id: companyId,
      name,
      code,
      status,
      client_name: clientName,
      location,
      start_date: startDate,
      created_by: createdBy,
      updated_by: createdBy,
    })
    .select("id")
    .single();
  if (error) throw error;
  log("project", name, "created", data.id);
  return data.id;
}

async function ensureTeam(
  companyId: string,
  projectId: string,
  name: string,
  code: string,
  color: Database["public"]["Enums"]["team_color"],
  displayOrder: number,
  createdBy: string | null,
): Promise<string> {
  const { data: existing } = await admin
    .from("teams")
    .select("id")
    .eq("project_id", projectId)
    .eq("name", name)
    .maybeSingle();
  if (existing) {
    log("team", name, "reused", existing.id);
    return existing.id;
  }

  const { data, error } = await admin
    .from("teams")
    .insert({
      company_id: companyId,
      project_id: projectId,
      name,
      code,
      color,
      status: "active",
      display_order: displayOrder,
      created_by: createdBy,
      updated_by: createdBy,
    })
    .select("id")
    .single();
  if (error) throw error;
  log("team", name, "created", data.id);
  return data.id;
}

async function ensureProjectAssignment(
  companyId: string,
  projectId: string,
  employeeId: string,
  role: Database["public"]["Enums"]["project_assignment_role"],
  label: string,
) {
  const { data: existing } = await admin
    .from("project_assignments")
    .select("id")
    .eq("project_id", projectId)
    .eq("employee_id", employeeId)
    .eq("assignment_role", role)
    .is("end_at", null)
    .maybeSingle();
  if (existing) {
    log("project-assignment", `${label} -> ${role}`, "reused");
    return;
  }

  const { error } = await admin
    .from("project_assignments")
    .insert({ company_id: companyId, project_id: projectId, employee_id: employeeId, assignment_role: role });
  if (error) throw error;
  log("project-assignment", `${label} -> ${role}`, "created");
}

async function placeOnTeam(
  companyId: string,
  projectId: string,
  teamId: string,
  employeeId: string,
  role: Database["public"]["Enums"]["team_assignment_role"],
  label: string,
  teamLabel: string,
) {
  const { data: existing } = await admin
    .from("team_assignments")
    .select("id, team_id, assignment_role")
    .eq("project_id", projectId)
    .eq("employee_id", employeeId)
    .is("end_at", null)
    .maybeSingle();

  if (existing && existing.team_id === teamId && existing.assignment_role === role) {
    log("team-assignment", `${label} -> ${teamLabel}`, "reused");
    return;
  }

  const now = new Date().toISOString();

  if (existing) {
    const { error: closeErr } = await admin
      .from("team_assignments")
      .update({ end_at: now, ended_at: now })
      .eq("id", existing.id);
    if (closeErr) throw closeErr;
  }

  const { error } = await admin.from("team_assignments").insert({
    company_id: companyId,
    project_id: projectId,
    team_id: teamId,
    employee_id: employeeId,
    assignment_role: role,
    start_at: now,
  });
  if (error) throw error;
  log("team-assignment", `${label} -> ${teamLabel}`, "created", existing ? "moved from previous team" : undefined);
}

async function ensureHistoricalMove(
  companyId: string,
  projectId: string,
  employeeId: string,
  fromTeamId: string,
  fromTeamLabel: string,
  toTeamId: string,
  toTeamLabel: string,
  label: string,
) {
  const { data: rows } = await admin
    .from("team_assignments")
    .select("id")
    .eq("project_id", projectId)
    .eq("employee_id", employeeId);

  if (rows && rows.length > 0) {
    log("historical-move", label, "skipped", "assignment history already present for this employee");
    return;
  }

  await placeOnTeam(companyId, projectId, fromTeamId, employeeId, "member", label, fromTeamLabel);
  await placeOnTeam(companyId, projectId, toTeamId, employeeId, "member", label, toTeamLabel);
  log("historical-move", label, "created", `${fromTeamLabel} -> ${toTeamLabel}`);
}

async function linkMyAccountToOrg(companyId: string) {
  const { data: list, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const me = list.users.find((u) => u.email?.toLowerCase() === MY_ACCOUNT_EMAIL.toLowerCase());
  if (!me) {
    throw new Error(
      `Could not find an existing auth user for ${MY_ACCOUNT_EMAIL}. This account must already exist ` +
        `(e.g. by having logged into the app at least once) — the seed never creates it, only links it.`,
    );
  }

  const membershipId = await ensureMembership(companyId, me.id, MY_ACCOUNT_EMAIL);
  await ensureMembershipRole(companyId, membershipId, "company_admin", MY_ACCOUNT_EMAIL);
  log("my-account", MY_ACCOUNT_EMAIL, "reused", `linked to ${COMPANY_NAME} as Company Manager`);
}

// ── main ───────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== Seeding ${COMPANY_NAME} ===\n`);

  const companyId = await ensureCompany();

  // 1) Role-holders: auth user -> profile -> employee(profile-linked) -> membership -> membership_role
  const employeeIds: Record<string, string> = {};
  let companyManagerProfileId: string | null = null;

  for (const person of ROLE_HOLDERS) {
    const userId = await ensureAuthUser(person.email, person.fullName, person.positionTitle);
    await waitForProfile(userId, person.fullName);
    if (person.key === "cm") companyManagerProfileId = userId;

    const { id: employeeId } = await ensureEmployee({
      companyId,
      firstName: person.firstName,
      lastName: person.lastName,
      positionTitle: person.positionTitle,
      startDate: person.startDate,
      workEmail: person.email,
      profileId: userId,
      createdBy: companyManagerProfileId,
    });
    employeeIds[person.key] = employeeId;

    const membershipId = await ensureMembership(companyId, userId, person.email);
    await ensureMembershipRole(companyId, membershipId, person.roleName, person.email);
  }

  // 2) General employees: workforce-only (no auth account, no profile_id)
  for (const person of GENERAL_EMPLOYEES) {
    const workEmail = workEmailFor(person.firstName, person.lastName);
    const { id: employeeId } = await ensureEmployee({
      companyId,
      firstName: person.firstName,
      lastName: person.lastName,
      positionTitle: "Employee",
      startDate: person.startDate,
      workEmail,
      createdBy: companyManagerProfileId,
    });
    employeeIds[person.key] = employeeId;

    if (person.terminated) {
      await ensureTerminated(employeeId, companyId, `${person.firstName} ${person.lastName}`, person.terminated.endDate, person.terminated.reason);
    }
  }

  // 3) Projects
  const northPlantId = await ensureProject(
    companyId,
    "North Plant Expansion",
    "NPE-2026-01",
    "active",
    "Northstar Industrial Client AB (test)",
    "Northstar Plant Site, Gothenburg",
    "2024-08-01",
    companyManagerProfileId,
  );
  const harborId = await ensureProject(
    companyId,
    "Harbor Maintenance Shutdown",
    "HMS-2026-01",
    "planning",
    "Northstar Port Authority (test)",
    "Northstar Harbor Site",
    "2024-09-01",
    companyManagerProfileId,
  );

  // 4) Teams
  const teamAlpha = await ensureTeam(companyId, northPlantId, "Team Alpha", "NPE-A", "blue", 0, companyManagerProfileId);
  const teamBravo = await ensureTeam(companyId, northPlantId, "Team Bravo", "NPE-B", "green", 1, companyManagerProfileId);
  const teamDelta = await ensureTeam(companyId, harborId, "Team Delta", "HMS-D", "orange", 0, companyManagerProfileId);
  const teamEcho = await ensureTeam(companyId, harborId, "Team Echo", "HMS-E", "purple", 1, companyManagerProfileId);

  // 5) Project-level roster + elevated-role assignments
  await ensureProjectAssignment(companyId, northPlantId, employeeIds.pm, "project_manager", "Johan Berg");
  await ensureProjectAssignment(companyId, northPlantId, employeeIds.hseq, "hseq_manager", "Anna Nilsson");
  await ensureProjectAssignment(companyId, northPlantId, employeeIds.hse1, "hse_officer", "Sara Olsson");
  await ensureProjectAssignment(companyId, northPlantId, employeeIds.inspector1, "inspector", "Emma Gustafsson");
  await ensureProjectAssignment(companyId, harborId, employeeIds.hse2, "hse_officer", "Lars Johansson");
  await ensureProjectAssignment(companyId, harborId, employeeIds.inspector2, "inspector", "Oskar Persson");

  // Roster ('member') rows for everyone who will also get a team placement —
  // matches how the app itself rosters an employee onto a project before
  // placing them on one of its teams.
  const northPlantRoster = ["foreman1", "foreman2", "emp01", "emp02", "emp03", "emp04", "emp05"];
  for (const key of northPlantRoster) {
    await ensureProjectAssignment(companyId, northPlantId, employeeIds[key], "member", key);
  }
  const harborRoster = ["foreman1", "emp06", "emp07", "emp09"];
  for (const key of harborRoster) {
    await ensureProjectAssignment(companyId, harborId, employeeIds[key], "member", key);
  }

  // 6) Team placements (final state)
  await placeOnTeam(companyId, northPlantId, teamAlpha, employeeIds.foreman1, "foreman", "Karl Andersson", "Team Alpha");
  await placeOnTeam(companyId, northPlantId, teamAlpha, employeeIds.emp01, "member", "Anders Holm", "Team Alpha");
  await placeOnTeam(companyId, northPlantId, teamAlpha, employeeIds.emp02, "member", "Björn Ström", "Team Alpha");

  await placeOnTeam(companyId, northPlantId, teamBravo, employeeIds.foreman2, "foreman", "Peter Karlsson", "Team Bravo");
  await placeOnTeam(companyId, northPlantId, teamBravo, employeeIds.emp04, "member", "David Ekström", "Team Bravo");
  await placeOnTeam(companyId, northPlantId, teamBravo, employeeIds.emp05, "member", "Elin Forsberg", "Team Bravo");

  // Foreman1 also manages a team on the OTHER project at the same time —
  // demonstrates an employee holding concurrent team assignments across two
  // different projects (allowed: "one active team per project", not per
  // employee overall).
  await placeOnTeam(companyId, harborId, teamDelta, employeeIds.foreman1, "foreman", "Karl Andersson", "Team Delta");
  await placeOnTeam(companyId, harborId, teamDelta, employeeIds.emp06, "member", "Fredrik Hedlund", "Team Delta");
  await placeOnTeam(companyId, harborId, teamDelta, employeeIds.emp07, "member", "Greta Isaksson", "Team Delta");

  // Team Echo deliberately has no foreman yet — a realistic, valid state.
  await placeOnTeam(companyId, harborId, teamEcho, employeeIds.emp09, "member", "Ida Karlström", "Team Echo");

  // 7) Historical team move — Cecilia Dahl: Team Bravo -> Team Alpha
  // (both within North Plant Expansion). Close-old-then-open-new, retaining
  // history, exactly as move_employee_to_team() does in the app.
  await ensureHistoricalMove(
    companyId,
    northPlantId,
    employeeIds.emp03,
    teamBravo,
    "Team Bravo",
    teamAlpha,
    "Team Alpha",
    "Cecilia Dahl",
  );

  // 8) Link the requester's existing platform account into this company
  await linkMyAccountToOrg(companyId);

  // ── summary ──────────────────────────────────────────────────────────
  console.log(`\n=== Summary ===`);
  const counts = report.reduce<Record<Action, number>>(
    (acc, r) => ({ ...acc, [r.action]: (acc[r.action] ?? 0) + 1 }),
    { created: 0, reused: 0, skipped: 0, updated: 0 },
  );
  console.log(`created=${counts.created} reused=${counts.reused} updated=${counts.updated} skipped=${counts.skipped}`);

  if (newCredentials.length > 0) {
    console.log(`\n=== New test-account credentials (TEST ONLY — shown once, not stored anywhere) ===`);
    for (const c of newCredentials) {
      console.log(`  ${c.role.padEnd(20)} ${c.email.padEnd(32)} ${c.password}`);
    }
  } else {
    console.log(`\nNo new auth accounts were created this run (all already existed).`);
  }

  console.log(`\nDone. Company id: ${companyId}\n`);
}

main().catch((err) => {
  console.error("\nSeed failed:", err);
  process.exit(1);
});
