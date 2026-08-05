import { createClient } from "@/lib/supabase/server";
import type { Scaffold, ScaffoldDetail, ScaffoldInspection, ScaffoldInspectionDetail, BasicEmployee, ScaffoldTeamMemberDetail } from "./types";
import { SCAFFOLD_INSPECTION_EXPIRING_SOON_DAYS } from "./types";
import type { Project } from "@/modules/projects/types";
import type { RoleName } from "@/modules/organizations/types";
import type { EmployeeOption } from "@/components/shared/employee-combobox";

/**
 * Server-only data access for the Scaffolds/Scaffold Inspections domain —
 * see docs/API_CONVENTIONS.md §7. Plain queries filtered explicitly by
 * `organization_id` (RLS also enforces this — see
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

/** Scaffolds visible to the caller in `organizationId` — RLS (scaffolds_select) does the real scoping. */
export async function listScaffolds(organizationId: string, filters: ScaffoldListFilters = {}): Promise<Scaffold[]> {
  const supabase = await createClient();
  let query = supabase.from("scaffolds").select("*").eq("organization_id", organizationId);

  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.workAreaSearch) query = query.ilike("work_area", `%${filters.workAreaSearch}%`);
  if (filters.scaffoldType) query = query.eq("scaffold_type", filters.scaffoldType as Scaffold["scaffold_type"]);
  if (filters.status) query = query.eq("status", filters.status as Scaffold["status"]);

  const { data, error } = await query.order("tag_number", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Recent scaffolds for the Safety Overview's list section — same filters/ordering as listScaffolds, capped to `limit`. */
export async function listRecentScaffoldsForOverview(organizationId: string, filters: ScaffoldListFilters, limit: number): Promise<Scaffold[]> {
  const results = await listScaffolds(organizationId, filters);
  return results.slice(0, limit);
}

/** A single scaffold scoped to `organizationId`, with its responsible foreman resolved. Null if it doesn't exist, belongs to another org, or RLS hides it. */
export async function getScaffold(organizationId: string, scaffoldId: string): Promise<ScaffoldDetail | null> {
  const supabase = await createClient();
  const { data: scaffold, error } = await supabase.from("scaffolds").select("*").eq("organization_id", organizationId).eq("id", scaffoldId).maybeSingle();
  if (error) throw error;
  if (!scaffold) return null;

  const { data: teamRows, error: teamError } = await supabase
    .from("scaffold_team_members")
    .select("id, employee_id, team_position")
    .eq("scaffold_id", scaffoldId)
    .is("removed_at", null)
    .order("team_position", { ascending: true });
  if (teamError) throw teamError;

  const employeeIds = [scaffold.responsible_foreman_id, ...(teamRows ?? []).map((row) => row.employee_id)];
  const { data: employees, error: employeesError } = await supabase.rpc("get_basic_employee_info", {
    target_employee_ids: employeeIds,
  });
  if (employeesError) throw employeesError;
  const employeeById = new Map((employees ?? []).map((employee) => [employee.id, employee]));

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

  return { ...scaffold, responsibleForeman: employeeById.get(scaffold.responsible_foreman_id) ?? null, teamMembers };
}

/** The current (finalized, not superseded) inspection's `expires_at` for each scaffold in `scaffoldIds` — the one query every "is this scaffold's status still valid right now" display needs (list badges, Safety Overview counts). Null entries mean no finalized inspection has ever applied (e.g. still pending_inspection). */
export async function getCurrentInspectionExpiryByScaffold(organizationId: string, scaffoldIds: string[]): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (scaffoldIds.length === 0) return result;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scaffold_inspections")
    .select("scaffold_id, expires_at, finalized_at")
    .eq("organization_id", organizationId)
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
export async function listScaffoldCandidateEmployees(organizationId: string, projectId: string): Promise<BasicEmployee[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_assignments")
    .select("employee_id")
    .eq("organization_id", organizationId)
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

/** Candidate pool for the Responsible Foreman picker — active employees who hold the organization Foreman role AND an open Foreman team assignment on this project (list_eligible_scaffold_foremen(), the same eligibility the database itself enforces on insert/update — see 20260805090000_scaffold_team_and_dimensions.sql). */
export async function listEligibleScaffoldForemen(organizationId: string, projectId: string): Promise<EmployeeOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_eligible_scaffold_foremen", { target_organization_id: organizationId, target_project_id: projectId });
  if (error) throw error;
  return (data ?? []).map((row) => toEmployeeOption(row, "Foreman"));
}

/** Candidate pool for ordinary scaffold team-member slots — active project roster employees excluding specialist/management roles (list_eligible_scaffold_team_members()). `roleLabel` is deliberately left null: no reliable trade/job-title field exists on this platform yet — see the migration's header comment. */
export async function listEligibleScaffoldTeamMembers(organizationId: string, projectId: string): Promise<EmployeeOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_eligible_scaffold_team_members", { target_organization_id: organizationId, target_project_id: projectId });
  if (error) throw error;
  return (data ?? []).map((row) => ({ value: row.id, label: `${row.first_name} ${row.last_name}`, employeeNumber: row.employee_number, roleLabel: row.position_title }));
}

const SCAFFOLD_MANAGE_ELIGIBLE_ROLES: RoleName[] = ["hse_officer", "inspector"];

/** Projects the caller can create a scaffold/inspection for — org-wide (every non-archived project) if hseq_manager, otherwise every project where they hold ANY current assignment AND also hold hse_officer/inspector (mirrors modules/observations/queries.ts's listObservationCreatableProjects — same "role-gated, not just any project_assignments row" fix). */
export async function listScaffoldCreatableProjects(organizationId: string, userId: string, roleNames: RoleName[]): Promise<Project[]> {
  const supabase = await createClient();
  const isHseqManager = roleNames.includes("hseq_manager");

  if (isHseqManager) {
    const { data, error } = await supabase.from("projects").select("*").eq("organization_id", organizationId).neq("status", "archived").order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  if (!roleNames.some((role) => SCAFFOLD_MANAGE_ELIGIBLE_ROLES.includes(role))) return [];

  const { data: employee, error: employeeError } = await supabase.from("employees").select("id").eq("organization_id", organizationId).eq("profile_id", userId).maybeSingle();
  if (employeeError) throw employeeError;
  if (!employee) return [];

  const [{ data: projectAssignments, error: projectAssignmentsError }, { data: teamAssignments, error: teamAssignmentsError }] = await Promise.all([
    supabase.from("project_assignments").select("project_id").eq("organization_id", organizationId).eq("employee_id", employee.id).is("end_at", null),
    supabase.from("team_assignments").select("project_id").eq("organization_id", organizationId).eq("employee_id", employee.id).is("end_at", null),
  ]);
  if (projectAssignmentsError) throw projectAssignmentsError;
  if (teamAssignmentsError) throw teamAssignmentsError;

  const projectIds = [...new Set([...(projectAssignments ?? []).map((row) => row.project_id), ...(teamAssignments ?? []).map((row) => row.project_id)])];
  if (projectIds.length === 0) return [];

  const { data: projects, error: projectsError } = await supabase.from("projects").select("*").eq("organization_id", organizationId).in("id", projectIds).order("name", { ascending: true });
  if (projectsError) throw projectsError;
  return projects ?? [];
}

/** Every inspection for one scaffold, newest first — the complete chronological inspection history this milestone requires. */
export async function listInspectionsForScaffold(organizationId: string, scaffoldId: string): Promise<ScaffoldInspection[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scaffold_inspections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("scaffold_id", scaffoldId)
    .order("inspected_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** A single inspection scoped to `organizationId`, with its checklist and inspector resolved. Null if it doesn't exist, belongs to another org, or RLS hides it. */
export async function getInspection(organizationId: string, inspectionId: string): Promise<ScaffoldInspectionDetail | null> {
  const supabase = await createClient();
  const { data: inspection, error } = await supabase.from("scaffold_inspections").select("*").eq("organization_id", organizationId).eq("id", inspectionId).maybeSingle();
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
export async function getScaffoldOverviewCounts(organizationId: string, projectId?: string): Promise<ScaffoldOverviewCounts> {
  const supabase = await createClient();
  let query = supabase.from("scaffolds").select("id, status").eq("organization_id", organizationId).neq("status", "closed");
  if (projectId) query = query.eq("project_id", projectId);
  const { data: scaffolds, error } = await query;
  if (error) throw error;

  const active = scaffolds ?? [];
  const safe = active.filter((s) => s.status === "safe").length;
  const restricted = active.filter((s) => s.status === "restricted").length;
  const unsafe = active.filter((s) => s.status === "unsafe").length;

  const expiryCandidates = active.filter((s) => s.status === "safe" || s.status === "restricted" || s.status === "awaiting_corrective_action");
  const expiryByScaffold = await getCurrentInspectionExpiryByScaffold(organizationId, expiryCandidates.map((s) => s.id));

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
