import { createClient } from "@/lib/supabase/server";
import type { SafetyObservation, SafetyObservationDetail, BasicEmployee } from "./types";
import type { Project } from "@/modules/projects/types";
import type { RoleName } from "@/modules/companies/types";

/**
 * Server-only data access for the Safety Observations domain — see
 * docs/API_CONVENTIONS.md §7. Plain queries filtered explicitly by
 * `company_id` (RLS also enforces this — see
 * supabase/migrations/20260802120000_safety_observations_and_corrective_actions.sql
 * — but explicit scoping keeps index usage and intent readable). No
 * PostgREST embeds, same reason as modules/lmra/queries.ts's header
 * comment.
 */

export type ObservationListFilters = {
  projectId?: string;
  workAreaSearch?: string;
  category?: string;
  riskLevel?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  /** Observations with at least one corrective action assigned to this employee — a cross-table filter, since responsible person is a corrective_actions concept, not the observation's own. */
  responsiblePersonId?: string;
  /** Observations with at least one overdue corrective action — same cross-table shape as responsiblePersonId. */
  overdueOnly?: boolean;
};

/** True if the calling user has ANY current project/team assignment on `projectId` — same underlying fact RLS checks via has_project_access(), queried directly for UI-gating, never as the actual access-control decision. */
export async function isCallerProjectAccessible(projectId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_project_access", { target_project_id: projectId });
  if (error) throw error;
  return data ?? false;
}

/** Observation ids with at least one corrective action matching the given cross-table filter — resolved first, then used to scope the main observations query via `.in("id", ...)`. */
async function resolveObservationIdsByCorrectiveActionFilter(
  companyId: string,
  filters: Pick<ObservationListFilters, "responsiblePersonId" | "overdueOnly">,
): Promise<string[] | null> {
  if (!filters.responsiblePersonId && !filters.overdueOnly) return null;

  const supabase = await createClient();
  let query = supabase.from("corrective_actions").select("observation_id").eq("company_id", companyId);
  if (filters.responsiblePersonId) query = query.eq("responsible_person_id", filters.responsiblePersonId);
  if (filters.overdueOnly) {
    const today = new Date().toISOString().slice(0, 10);
    query = query.lt("due_date", today).not("status", "in", "(closed,rejected)");
  }

  const { data, error } = await query;
  if (error) throw error;
  return [...new Set((data ?? []).map((row) => row.observation_id))];
}

/** Observations visible to the caller in `companyId` — RLS (safety_observations_select) does the real scoping. Newest observed_at first. */
export async function listObservations(companyId: string, filters: ObservationListFilters = {}): Promise<SafetyObservation[]> {
  const supabase = await createClient();

  const correctiveActionObservationIds = await resolveObservationIdsByCorrectiveActionFilter(companyId, filters);
  if (correctiveActionObservationIds !== null && correctiveActionObservationIds.length === 0) return [];

  let query = supabase.from("safety_observations").select("*").eq("company_id", companyId);

  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.workAreaSearch) query = query.ilike("work_area", `%${filters.workAreaSearch}%`);
  if (filters.category) query = query.eq("category", filters.category as SafetyObservation["category"]);
  if (filters.riskLevel) query = query.eq("risk_level", filters.riskLevel as SafetyObservation["risk_level"]);
  if (filters.status) query = query.eq("status", filters.status as SafetyObservation["status"]);
  if (filters.dateFrom) query = query.gte("observed_at", filters.dateFrom);
  if (filters.dateTo) query = query.lte("observed_at", filters.dateTo);
  if (correctiveActionObservationIds !== null) query = query.in("id", correctiveActionObservationIds);

  const { data, error } = await query.order("observed_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** A single observation scoped to `companyId`, with observer/participants resolved via get_basic_employee_info() (never a raw employees select for anyone but the caller's own company-scoped lookup). Null if it doesn't exist, belongs to another company, or RLS hides it. */
export async function getObservation(companyId: string, observationId: string): Promise<SafetyObservationDetail | null> {
  const supabase = await createClient();

  const { data: observation, error: observationError } = await supabase
    .from("safety_observations")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", observationId)
    .maybeSingle();
  if (observationError) throw observationError;
  if (!observation) return null;

  const { data: participants, error: participantsError } = await supabase
    .from("safety_observation_participants")
    .select("*")
    .eq("observation_id", observationId);
  if (participantsError) throw participantsError;

  const employeeIds = [...new Set([observation.observer_id, ...(participants ?? []).map((p) => p.employee_id)])];

  const { data: employees, error: employeesError } = await supabase.rpc("get_basic_employee_info", {
    target_employee_ids: employeeIds,
  });
  if (employeesError) throw employeesError;
  const employeeById = new Map((employees ?? []).map((e) => [e.id, e]));

  return {
    ...observation,
    observer: employeeById.get(observation.observer_id) ?? null,
    participants: (participants ?? [])
      .filter((p) => employeeById.has(p.employee_id))
      .map((p) => ({ ...p, employee: employeeById.get(p.employee_id) as BasicEmployee })),
  };
}

/** Employee ids currently rostered onto `projectId` — the candidate pool for the observer select and the "people involved" picker, same "only project-assigned employees are selectable" convention as modules/lmra/queries.ts's listLmraCandidateEmployeeIds. */
export async function listObservationCandidateEmployees(companyId: string, projectId: string): Promise<BasicEmployee[]> {
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

  const { data: employees, error: employeesError } = await supabase.rpc("get_basic_employee_info", {
    target_employee_ids: employeeIds,
  });
  if (employeesError) throw employeesError;
  return (employees ?? []).sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));
}

/** Roles safety_observations_insert admits alongside hseq_manager — see that RLS policy in the migration. A caller holding NONE of these (e.g. company_admin, even one with a stray project_assignments row from unrelated historical test data) is never creatable-anywhere, regardless of project assignments. */
const OBSERVATION_CREATE_ELIGIBLE_ROLES: RoleName[] = ["hse_officer", "foreman", "inspector", "employee"];

/**
 * Projects the caller can create an observation for — company-wide (every
 * non-archived project) if they hold `hseq_manager`, otherwise every
 * project where they currently hold ANY active project_assignments or
 * team_assignments row, AND ONLY if they also hold at least one of
 * `OBSERVATION_CREATE_ELIGIBLE_ROLES` (unlike modules/lmra/queries.ts's
 * listLmraCreatableProjects, which restricts non-HSE-Manager callers to
 * specifically their FOREMAN project — Safety Observations' "C" tier is
 * broader: any project role, per docs/ROLES_AND_PERMISSIONS.md §5 footnote
 * 12's "safety reporting should never be gated behind a manager role" —
 * but still role-gated, not "anyone with a project_assignments row of any
 * kind," which would incorrectly include company_admin/operations_manager/
 * project_manager, the module's View-only roles). Same RLS-narrowing
 * caveat as listLmraCreatableProjects: this is a "what should I show them"
 * read, not the real enforcement.
 */
export async function listObservationCreatableProjects(companyId: string, userId: string, roleNames: RoleName[]): Promise<Project[]> {
  const supabase = await createClient();
  const isHseqManager = roleNames.includes("hseq_manager");

  if (isHseqManager) {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("company_id", companyId)
      .neq("status", "archived")
      .order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  if (!roleNames.some((role) => OBSERVATION_CREATE_ELIGIBLE_ROLES.includes(role))) return [];

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id")
    .eq("company_id", companyId)
    .eq("profile_id", userId)
    .maybeSingle();
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

  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("*")
    .eq("company_id", companyId)
    .in("id", projectIds)
    .order("name", { ascending: true });
  if (projectsError) throw projectsError;
  return projects ?? [];
}

// ── Safety Overview aggregations ─────────────────────────────────────

export type ObservationOverviewCounts = {
  createdToday: number;
  openHighRisk: number;
  stopWork: number;
};

/** Counts backing the Safety Overview's Safety Observations section. Every count is a real, scoped query — no fabricated numbers. */
export async function getObservationOverviewCounts(companyId: string, projectId?: string): Promise<ObservationOverviewCounts> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  function scoped() {
    let q = supabase.from("safety_observations").select("id", { count: "exact", head: true }).eq("company_id", companyId);
    if (projectId) q = q.eq("project_id", projectId);
    return q;
  }

  const [createdToday, openHighRisk, stopWork] = await Promise.all([
    scoped().gte("observed_at", `${today}T00:00:00.000Z`),
    scoped().eq("status", "open").in("risk_level", ["high", "critical"]),
    scoped().eq("is_stop_work", true).eq("status", "open"),
  ]);

  for (const r of [createdToday, openHighRisk, stopWork]) {
    if (r.error) throw r.error;
  }

  return {
    createdToday: createdToday.count ?? 0,
    openHighRisk: openHighRisk.count ?? 0,
    stopWork: stopWork.count ?? 0,
  };
}

/** Recent observation activity for the Safety Overview's list section — same filters/ordering as listObservations, capped to `limit`. */
export async function listRecentObservationsForOverview(companyId: string, filters: ObservationListFilters, limit: number): Promise<SafetyObservation[]> {
  const results = await listObservations(companyId, filters);
  return results.slice(0, limit);
}
