import { createClient } from "@/lib/supabase/server";
import type { Scaffold, ScaffoldDetail, ScaffoldInspection, ScaffoldInspectionDetail, ScaffoldInspectionWithScaffold, BasicEmployee, ScaffoldTeamMemberDetail, ScaffoldErectionTeamDetail, ScaffoldPhotoDetail } from "./types";
import { SCAFFOLD_INSPECTION_EXPIRING_SOON_DAYS } from "./types";
import { getScaffoldPhotoSignedUrl } from "@/lib/storage/scaffold-photos";
import { listDailyTeamsForDate } from "@/modules/daily-workforce/queries";
import type { Project } from "@/modules/projects/types";
import type { RoleName } from "@/modules/companies/types";
import type { EmployeeOption } from "@/modules/employees/employee-options";

/**
 * Server-only data access for the Scaffolds/Scaffold Inspections domain —
 * see docs/API_CONVENTIONS.md §7. Plain queries filtered explicitly by
 * `company_id` (RLS also enforces this — see
 * supabase/migrations/20260803120000_scaffold_inspections.sql — but
 * explicit scoping keeps index usage and intent readable). No PostgREST
 * embeds, same reason as modules/lmra/queries.ts's header comment.
 */

export type ScaffoldListFilters = {
  projectId?: string;
  workAreaSearch?: string;
  scaffoldType?: string;
  status?: string;
};

/** True if the calling user has ANY current project/team assignment on `projectId` — same convention as modules/observations/queries.ts's isCallerProjectAccessible. */
export async function isCallerProjectAccessible(projectId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_project_access", { target_project_id: projectId });
  if (error) throw error;
  return data ?? false;
}

/** V2 (Part 4): true if the calling user is, themselves, an eligible Responsible Foreman for `projectId` (is_caller_eligible_scaffold_foreman() — the same rule the server-side self-lock trigger uses). Drives the UI's "lock the Responsible Foreman field to me" behavior; never the real enforcement (validate_scaffold_insert() is). */
export async function isCallerEligibleScaffoldForeman(companyId: string, projectId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_caller_eligible_scaffold_foreman", { target_company_id: companyId, target_project_id: projectId });
  if (error) throw error;
  return data ?? false;
}

/** V2 (Part 4F): true if the caller may upload/delete/reorder THIS scaffold's completion photos — wraps can_manage_scaffold_photos() exactly (manage tier OR the scaffold's own Responsible Foreman). Drives whether the photo gallery renders its upload/delete/reorder controls; never the real enforcement (RLS + the Server Functions in photo-actions.ts are). */
export async function canManageScaffoldPhotos(scaffoldId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("can_manage_scaffold_photos", { target_scaffold_id: scaffoldId });
  if (error) throw error;
  return data ?? false;
}

/**
 * V2 (Part 4C): candidate Today's Teams for the "Teams assigned to
 * scaffold erection" picker, for one project + erection date — reuses
 * modules/daily-workforce/queries.ts's listDailyTeamsForDate() (the same
 * data Today's Teams itself renders from), never a separate/duplicated
 * fetch. `restrictToOwnTeamsForEmployeeId`, when set (a Foreman relying
 * only on the self-only creation path), filters down to teams whose
 * `foreman_employee_id` equals that id — a Foreman must never even SEE
 * another foreman's team in this picker, let alone select it (the real
 * enforcement is still validate_scaffold_erection_team_insert() server-
 * side; this is the matching UI-side narrowing so the picker itself never
 * offers a choice that would be rejected).
 */
export async function listEligibleErectionTeams(
  companyId: string,
  projectId: string,
  workDate: string,
  restrictToOwnTeamsForEmployeeId?: string,
): Promise<{ id: string; name: string; shift: string | null; workArea: string | null; foremanName: string | null; workerCount: number }[]> {
  const teams = await listDailyTeamsForDate(companyId, projectId, workDate);
  const filtered = restrictToOwnTeamsForEmployeeId ? teams.filter((team) => team.foreman_employee_id === restrictToOwnTeamsForEmployeeId) : teams;
  return filtered.map((team) => ({
    id: team.id,
    name: team.name,
    shift: team.shift,
    workArea: team.work_area,
    foremanName: team.foreman ? `${team.foreman.first_name} ${team.foreman.last_name}` : null,
    workerCount: team.workers.length,
  }));
}

/** Scaffolds visible to the caller in `companyId` — RLS (scaffolds_select) does the real scoping. */
export async function listScaffolds(companyId: string, filters: ScaffoldListFilters = {}): Promise<Scaffold[]> {
  const supabase = await createClient();
  let query = supabase.from("scaffolds").select("*").eq("company_id", companyId);

  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.workAreaSearch) query = query.ilike("work_area", `%${filters.workAreaSearch}%`);
  if (filters.scaffoldType) query = query.eq("scaffold_type", filters.scaffoldType as Scaffold["scaffold_type"]);
  if (filters.status) query = query.eq("status", filters.status as Scaffold["status"]);

  const { data, error } = await query.order("tag_number", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Recent scaffolds for the Safety Overview's list section — same filters/ordering as listScaffolds, capped to `limit`. */
export async function listRecentScaffoldsForOverview(companyId: string, filters: ScaffoldListFilters, limit: number): Promise<Scaffold[]> {
  const results = await listScaffolds(companyId, filters);
  return results.slice(0, limit);
}

/** A single scaffold scoped to `companyId`, with its responsible foreman, erection teams (V2), legacy roster (if any), and completion photos resolved. Null if it doesn't exist, belongs to another company, or RLS hides it. */
export async function getScaffold(companyId: string, scaffoldId: string): Promise<ScaffoldDetail | null> {
  const supabase = await createClient();
  const { data: scaffold, error } = await supabase.from("scaffolds").select("*").eq("company_id", companyId).eq("id", scaffoldId).maybeSingle();
  if (error) throw error;
  if (!scaffold) return null;

  const [{ data: teamRows, error: teamError }, { data: erectionTeamRows, error: erectionTeamError }, { data: photoRows, error: photoError }] = await Promise.all([
    supabase.from("scaffold_team_members").select("id, employee_id, team_position").eq("scaffold_id", scaffoldId).is("removed_at", null).order("team_position", { ascending: true }),
    supabase.from("scaffold_erection_teams").select("id, daily_team_id").eq("scaffold_id", scaffoldId),
    supabase.from("scaffold_photos").select("id, storage_object_path, original_filename, uploaded_by, uploaded_at, order_index").eq("scaffold_id", scaffoldId).order("order_index", { ascending: true }),
  ]);
  if (teamError) throw teamError;
  if (erectionTeamError) throw erectionTeamError;
  if (photoError) throw photoError;

  const dailyTeamIds = (erectionTeamRows ?? []).map((row) => row.daily_team_id);
  const { data: dailyTeamRows, error: dailyTeamsError } =
    dailyTeamIds.length > 0
      ? await supabase.from("daily_teams").select("id, name, shift, work_area, foreman_employee_id").in("id", dailyTeamIds)
      : { data: [], error: null };
  if (dailyTeamsError) throw dailyTeamsError;
  const dailyTeamById = new Map((dailyTeamRows ?? []).map((row) => [row.id, row]));

  const workerCountByDailyTeamId = new Map<string, number>();
  if (dailyTeamIds.length > 0) {
    const { data: memberRows, error: memberError } = await supabase.from("daily_team_members").select("daily_team_id").in("daily_team_id", dailyTeamIds).is("removed_at", null);
    if (memberError) throw memberError;
    for (const row of memberRows ?? []) {
      workerCountByDailyTeamId.set(row.daily_team_id, (workerCountByDailyTeamId.get(row.daily_team_id) ?? 0) + 1);
    }
  }

  const employeeIds = [
    scaffold.responsible_foreman_id,
    ...(teamRows ?? []).map((row) => row.employee_id),
    ...(dailyTeamRows ?? []).map((row) => row.foreman_employee_id).filter((id): id is string => Boolean(id)),
  ];
  const [{ data: employees, error: employeesError }, { data: uploaderProfiles, error: uploaderProfilesError }] = await Promise.all([
    supabase.rpc("get_basic_employee_info", { target_employee_ids: [...new Set(employeeIds)] }),
    photoRows && photoRows.length > 0
      ? supabase.rpc("get_basic_profile_info", { target_company_id: companyId, target_user_ids: [...new Set(photoRows.map((row) => row.uploaded_by))] })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (employeesError) throw employeesError;
  if (uploaderProfilesError) throw uploaderProfilesError;
  const employeeById = new Map((employees ?? []).map((employee) => [employee.id, employee]));
  const uploaderNameById = new Map((uploaderProfiles ?? []).map((profile) => [profile.id, profile.full_name]));

  const teamMembers: ScaffoldTeamMemberDetail[] = (teamRows ?? []).map((row) => {
    const employee = employeeById.get(row.employee_id);
    return {
      id: row.id,
      employeeId: row.employee_id,
      teamPosition: row.team_position,
      firstName: employee?.first_name ?? "Unknown",
      lastName: employee?.last_name ?? "employee",
    };
  });

  const erectionTeams: ScaffoldErectionTeamDetail[] = [];
  for (const row of erectionTeamRows ?? []) {
    const team = dailyTeamById.get(row.daily_team_id);
    if (!team) continue;
    const foreman = team.foreman_employee_id ? employeeById.get(team.foreman_employee_id) : null;
    erectionTeams.push({
      id: row.id,
      dailyTeamId: row.daily_team_id,
      name: team.name,
      shift: team.shift,
      workArea: team.work_area,
      foremanName: foreman ? `${foreman.first_name} ${foreman.last_name}` : null,
      workerCount: workerCountByDailyTeamId.get(row.daily_team_id) ?? 0,
    });
  }

  const photos: ScaffoldPhotoDetail[] = (
    await Promise.all(
      (photoRows ?? []).map(async (row) => {
        const url = await getScaffoldPhotoSignedUrl(supabase, row.storage_object_path);
        if (!url) return null;
        return {
          id: row.id,
          url,
          originalFilename: row.original_filename,
          uploadedByName: uploaderNameById.get(row.uploaded_by) ?? null,
          uploadedAt: row.uploaded_at,
          orderIndex: row.order_index,
        };
      }),
    )
  ).filter((row): row is ScaffoldPhotoDetail => row !== null);

  return { ...scaffold, responsibleForeman: employeeById.get(scaffold.responsible_foreman_id) ?? null, teamMembers, erectionTeams, photos };
}

/** The current (finalized, not superseded) inspection's `expires_at` for each scaffold in `scaffoldIds` — the one query every "is this scaffold's status still valid right now" display needs (list badges, Safety Overview counts). Null entries mean no finalized inspection has ever applied (e.g. still pending_inspection). */
export async function getCurrentInspectionExpiryByScaffold(companyId: string, scaffoldIds: string[]): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (scaffoldIds.length === 0) return result;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scaffold_inspections")
    .select("scaffold_id, expires_at, finalized_at")
    .eq("company_id", companyId)
    .in("scaffold_id", scaffoldIds)
    .eq("status", "finalized")
    .is("superseded_by_id", null)
    .order("finalized_at", { ascending: false });
  if (error) throw error;

  // First occurrence per scaffold_id after descending order = the latest.
  for (const row of data ?? []) {
    if (!result.has(row.scaffold_id)) result.set(row.scaffold_id, row.expires_at);
  }
  return result;
}

/** Employee ids currently rostered onto `projectId` — the candidate pool for the responsible-foreman/inspector pickers, same convention as every other module this session. */
export async function listScaffoldCandidateEmployees(companyId: string, projectId: string): Promise<BasicEmployee[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_assignments")
    .select("employee_id")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .is("end_at", null);
  if (error) throw error;
  const employeeIds = [...new Set((data ?? []).map((row) => row.employee_id))];
  if (employeeIds.length === 0) return [];

  const { data: employees, error: employeesError } = await supabase.rpc("get_basic_employee_info", { target_employee_ids: employeeIds });
  if (employeesError) throw employeesError;
  return (employees ?? []).sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));
}

function toEmployeeOption(row: { id: string; first_name: string; last_name: string; employee_number: string | null }, roleLabel: string | null): EmployeeOption {
  return { value: row.id, label: `${row.first_name} ${row.last_name}`, employeeNumber: row.employee_number, roleLabel };
}

/** Candidate pool for the Responsible Foreman picker — active employees who hold the company Foreman role AND an open Foreman team assignment on this project (list_eligible_scaffold_foremen(), the same eligibility the database itself enforces on insert/update — see 20260805090000_scaffold_team_and_dimensions.sql). */
export async function listEligibleScaffoldForemen(companyId: string, projectId: string): Promise<EmployeeOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_eligible_scaffold_foremen", { target_organization_id: companyId, target_project_id: projectId });
  if (error) throw error;
  return (data ?? []).map((row) => toEmployeeOption(row, "Foreman"));
}

/** Candidate pool for ordinary scaffold team-member slots — active project roster employees excluding specialist/management roles (list_eligible_scaffold_team_members()). `roleLabel` is deliberately left null: no reliable trade/job-title field exists on this platform yet — see the migration's header comment. */
export async function listEligibleScaffoldTeamMembers(companyId: string, projectId: string): Promise<EmployeeOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_eligible_scaffold_team_members", { target_organization_id: companyId, target_project_id: projectId });
  if (error) throw error;
  return (data ?? []).map((row) => ({ value: row.id, label: `${row.first_name} ${row.last_name}`, employeeNumber: row.employee_number, roleLabel: row.position_title }));
}

const SCAFFOLD_INSPECTION_MANAGE_ELIGIBLE_ROLES: RoleName[] = ["hse_officer", "inspector"];

/** Projects the caller can create a scaffold INSPECTION for — company-wide (every non-archived project) if hseq_manager, otherwise every project where they hold ANY current assignment AND also hold hse_officer/inspector (mirrors modules/observations/queries.ts's listObservationCreatableProjects — same "role-gated, not just any project_assignments row" fix). Scaffold inspection creation rights are UNCHANGED by V2 — see modules/scaffolds/permissions.ts's canManageScaffold, still used for this. */
export async function listScaffoldInspectionCreatableProjects(companyId: string, userId: string, roleNames: RoleName[]): Promise<Project[]> {
  const supabase = await createClient();
  const isHseqManager = roleNames.includes("hseq_manager");

  if (isHseqManager) {
    const { data, error } = await supabase.from("projects").select("*").eq("company_id", companyId).neq("status", "archived").order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  if (!roleNames.some((role) => SCAFFOLD_INSPECTION_MANAGE_ELIGIBLE_ROLES.includes(role))) return [];

  const { data: employee, error: employeeError } = await supabase.from("employees").select("id").eq("company_id", companyId).eq("profile_id", userId).maybeSingle();
  if (employeeError) throw employeeError;
  if (!employee) return [];

  const [{ data: projectAssignments, error: projectAssignmentsError }, { data: teamAssignments, error: teamAssignmentsError }] = await Promise.all([
    supabase.from("project_assignments").select("project_id").eq("company_id", companyId).eq("employee_id", employee.id).is("end_at", null),
    supabase.from("team_assignments").select("project_id").eq("company_id", companyId).eq("employee_id", employee.id).is("end_at", null),
  ]);
  if (projectAssignmentsError) throw projectAssignmentsError;
  if (teamAssignmentsError) throw teamAssignmentsError;

  const projectIds = [...new Set([...(projectAssignments ?? []).map((row) => row.project_id), ...(teamAssignments ?? []).map((row) => row.project_id)])];
  if (projectIds.length === 0) return [];

  const { data: projects, error: projectsError } = await supabase.from("projects").select("*").eq("company_id", companyId).in("id", projectIds).order("name", { ascending: true });
  if (projectsError) throw projectsError;
  return projects ?? [];
}

/**
 * V2 (Part 4): projects the caller can REGISTER a scaffold for — broader
 * than listScaffoldInspectionCreatableProjects, mirrors
 * is_scaffold_broad_creator() (SQL) plus the Foreman self-only path.
 * company_admin/hseq_manager: every non-archived project, company-wide.
 * hse_officer/inspector: any project they're assigned to (role-gated, not
 * just any project_assignments row). project_manager: only projects where
 * they hold an actual assignment_role='project_manager' row (is_project_manager()'s
 * own real semantics — NOT merely "any assignment" the way hse_officer/
 * inspector's check works, since project_manager is a specific assignment
 * role, not a company-wide role plus loose project membership). foreman:
 * only projects where they are, themselves, an eligible Responsible
 * Foreman (is_eligible_scaffold_foreman()).
 */
export async function listScaffoldRegisterCreatableProjects(companyId: string, userId: string, roleNames: RoleName[]): Promise<Project[]> {
  const supabase = await createClient();

  if (roleNames.includes("hseq_manager") || roleNames.includes("company_admin")) {
    const { data, error } = await supabase.from("projects").select("*").eq("company_id", companyId).neq("status", "archived").order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  const { data: employee, error: employeeError } = await supabase.from("employees").select("id").eq("company_id", companyId).eq("profile_id", userId).maybeSingle();
  if (employeeError) throw employeeError;
  if (!employee) return [];

  const projectIdSet = new Set<string>();

  if (roleNames.some((role) => SCAFFOLD_INSPECTION_MANAGE_ELIGIBLE_ROLES.includes(role))) {
    const [{ data: projectAssignments, error: projectAssignmentsError }, { data: teamAssignments, error: teamAssignmentsError }] = await Promise.all([
      supabase.from("project_assignments").select("project_id").eq("company_id", companyId).eq("employee_id", employee.id).is("end_at", null),
      supabase.from("team_assignments").select("project_id").eq("company_id", companyId).eq("employee_id", employee.id).is("end_at", null),
    ]);
    if (projectAssignmentsError) throw projectAssignmentsError;
    if (teamAssignmentsError) throw teamAssignmentsError;
    for (const row of projectAssignments ?? []) projectIdSet.add(row.project_id);
    for (const row of teamAssignments ?? []) projectIdSet.add(row.project_id);
  }

  if (roleNames.includes("project_manager")) {
    const { data: pmAssignments, error: pmError } = await supabase
      .from("project_assignments")
      .select("project_id")
      .eq("company_id", companyId)
      .eq("employee_id", employee.id)
      .eq("assignment_role", "project_manager")
      .is("end_at", null);
    if (pmError) throw pmError;
    for (const row of pmAssignments ?? []) projectIdSet.add(row.project_id);
  }

  if (roleNames.includes("foreman")) {
    const { data: foremanAssignments, error: foremanError } = await supabase
      .from("team_assignments")
      .select("project_id")
      .eq("company_id", companyId)
      .eq("employee_id", employee.id)
      .eq("assignment_role", "foreman")
      .is("end_at", null);
    if (foremanError) throw foremanError;
    for (const row of foremanAssignments ?? []) projectIdSet.add(row.project_id);
  }

  if (projectIdSet.size === 0) return [];

  const { data: projects, error: projectsError } = await supabase.from("projects").select("*").eq("company_id", companyId).in("id", [...projectIdSet]).order("name", { ascending: true });
  if (projectsError) throw projectsError;
  return projects ?? [];
}

/** Every inspection for one scaffold, newest first — the complete chronological inspection history this milestone requires. */
export async function listInspectionsForScaffold(companyId: string, scaffoldId: string): Promise<ScaffoldInspection[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scaffold_inspections")
    .select("*")
    .eq("company_id", companyId)
    .eq("scaffold_id", scaffoldId)
    .order("inspected_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** A single inspection scoped to `companyId`, with its checklist and inspector resolved. Null if it doesn't exist, belongs to another company, or RLS hides it. */
export async function getInspection(companyId: string, inspectionId: string): Promise<ScaffoldInspectionDetail | null> {
  const supabase = await createClient();
  const { data: inspection, error } = await supabase.from("scaffold_inspections").select("*").eq("company_id", companyId).eq("id", inspectionId).maybeSingle();
  if (error) throw error;
  if (!inspection) return null;

  const [{ data: items, error: itemsError }, { data: employees, error: employeesError }] = await Promise.all([
    supabase.from("scaffold_inspection_items").select("*").eq("scaffold_inspection_id", inspectionId),
    supabase.rpc("get_basic_employee_info", { target_employee_ids: [inspection.inspector_id] }),
  ]);
  if (itemsError) throw itemsError;
  if (employeesError) throw employeesError;

  return {
    ...inspection,
    inspector: employees?.[0] ?? null,
    items: (items ?? []).sort((a, b) => a.item_type.localeCompare(b.item_type)),
  };
}

export type ScaffoldInspectionListFilters = {
  status?: string;
  outcome?: string;
};

/**
 * Every inspection across a project's scaffolds, newest first — backs the
 * project-wide Scaffold Inspections list (Planning & Daily nav). Two
 * queries, no PostgREST embeds (see header comment); each inspection
 * carries its parent scaffold's tag_number/scaffold_number/work_area so
 * rows can render and link (to the SAME canonical inspection-detail route
 * a scaffold's own history list links to) without an extra round trip per
 * row.
 */
export async function listInspectionsForProject(
  companyId: string,
  projectId: string,
  filters: ScaffoldInspectionListFilters = {},
): Promise<ScaffoldInspectionWithScaffold[]> {
  const supabase = await createClient();
  let query = supabase.from("scaffold_inspections").select("*").eq("company_id", companyId).eq("project_id", projectId);
  if (filters.status) query = query.eq("status", filters.status as ScaffoldInspection["status"]);
  if (filters.outcome) query = query.eq("outcome", filters.outcome as NonNullable<ScaffoldInspection["outcome"]>);

  const { data: inspections, error } = await query.order("inspected_at", { ascending: false });
  if (error) throw error;
  if (!inspections || inspections.length === 0) return [];

  const scaffoldIds = [...new Set(inspections.map((inspection) => inspection.scaffold_id))];
  const { data: scaffolds, error: scaffoldsError } = await supabase
    .from("scaffolds")
    .select("id, tag_number, scaffold_number, work_area")
    .eq("company_id", companyId)
    .in("id", scaffoldIds);
  if (scaffoldsError) throw scaffoldsError;
  const scaffoldById = new Map((scaffolds ?? []).map((scaffold) => [scaffold.id, scaffold]));

  return inspections
    .filter((inspection) => scaffoldById.has(inspection.scaffold_id))
    .map((inspection) => ({ ...inspection, scaffold: scaffoldById.get(inspection.scaffold_id)! }));
}

// ── Safety Overview aggregations ─────────────────────────────────────

export type ScaffoldOverviewCounts = {
  totalActive: number;
  safe: number;
  restricted: number;
  unsafe: number;
  expiringSoon: number;
  expired: number;
};

/**
 * Counts backing the Safety Overview's Scaffold Inspections section.
 * "Total active" excludes closed/dismantled scaffolds. "Expiring soon"/
 * "expired" are computed from each active scaffold's CURRENT inspection
 * expiry (see getCurrentInspectionExpiryByScaffold) — never a stored
 * flag, and a scaffold already `unsafe` is not double-counted into either
 * expiry bucket (its status already says everything that matters).
 */
export async function getScaffoldOverviewCounts(companyId: string, projectId?: string): Promise<ScaffoldOverviewCounts> {
  const supabase = await createClient();
  let query = supabase.from("scaffolds").select("id, status").eq("company_id", companyId).neq("status", "closed");
  if (projectId) query = query.eq("project_id", projectId);
  const { data: scaffolds, error } = await query;
  if (error) throw error;

  const active = scaffolds ?? [];
  const safe = active.filter((s) => s.status === "safe").length;
  const restricted = active.filter((s) => s.status === "restricted").length;
  const unsafe = active.filter((s) => s.status === "unsafe").length;

  const expiryCandidates = active.filter((s) => s.status === "safe" || s.status === "restricted" || s.status === "awaiting_corrective_action");
  const expiryByScaffold = await getCurrentInspectionExpiryByScaffold(companyId, expiryCandidates.map((s) => s.id));

  const now = Date.now();
  const soonThreshold = now + SCAFFOLD_INSPECTION_EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000;
  let expiringSoon = 0;
  let expired = 0;
  for (const expiresAt of expiryByScaffold.values()) {
    if (!expiresAt) continue;
    const expiryTime = new Date(expiresAt).getTime();
    if (expiryTime <= now) expired++;
    else if (expiryTime <= soonThreshold) expiringSoon++;
  }

  return {
    totalActive: active.length,
    safe,
    restricted,
    unsafe,
    expiringSoon,
    expired,
  };
}
