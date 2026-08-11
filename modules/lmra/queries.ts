import { createClient } from "@/lib/supabase/server";
import type { LmraAssessment, LmraAssessmentDetail, BasicEmployee } from "./types";

/**
 * Server-only data access for the LMRA domain — see docs/API_CONVENTIONS.md
 * §7. Plain queries filtered explicitly by `company_id` (RLS also
 * enforces this — see supabase/migrations/20260801090000_lmra.sql — but
 * explicit scoping keeps index usage and intent readable). No PostgREST
 * embeds, same reason as modules/employees/queries.ts's header comment.
 *
 * `getMyEmployeeId`/`listDailyTeamsForDate`/`isCallerProjectAccessible` are
 * imported directly from modules/daily-workforce/queries.ts rather than
 * redeclared here — that module was built specifically to be reused by
 * LMRA/Toolbox/Safety Observations (its own Phase I), and LMRA's Today's
 * Team integration (Phase 3 of this redesign) is the first real consumer.
 */
export { getMyEmployeeId, listDailyTeamsForDate, isCallerProjectAccessible } from "@/modules/daily-workforce/queries";

export type LmraListFilters = {
  projectId?: string;
  status?: string;
  workAreaSearch?: string;
  dateFrom?: string;
  dateTo?: string;
};

/** Assessments visible to the caller in `companyId` — RLS (lmra_assessments_select) does the real scoping. Newest work_date first. */
export async function listLmraAssessments(companyId: string, filters: LmraListFilters = {}): Promise<LmraAssessment[]> {
  const supabase = await createClient();
  let query = supabase.from("lmra_assessments").select("*").eq("company_id", companyId);

  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.status) query = query.eq("status", filters.status as LmraAssessment["status"]);
  if (filters.workAreaSearch) query = query.ilike("work_area", `%${filters.workAreaSearch}%`);
  if (filters.dateFrom) query = query.gte("work_date", filters.dateFrom);
  if (filters.dateTo) query = query.lte("work_date", filters.dateTo);

  const { data, error } = await query.order("work_date", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** A single assessment scoped to `companyId`, with completed-by/responsible-person/hazards/participants resolved via get_basic_employee_info() (never a raw employees select for anyone but the caller's own company-scoped lookup). Null if it doesn't exist, belongs to another company, or RLS hides it. */
export async function getLmraAssessment(companyId: string, lmraId: string): Promise<LmraAssessmentDetail | null> {
  const supabase = await createClient();

  const { data: assessment, error: assessmentError } = await supabase
    .from("lmra_assessments")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", lmraId)
    .maybeSingle();
  if (assessmentError) throw assessmentError;
  if (!assessment) return null;

  const [{ data: hazards, error: hazardsError }, { data: participants, error: participantsError }] = await Promise.all([
    supabase.from("lmra_hazards").select("*").eq("lmra_assessment_id", lmraId),
    supabase.from("lmra_participants").select("*").eq("lmra_assessment_id", lmraId),
  ]);
  if (hazardsError) throw hazardsError;
  if (participantsError) throw participantsError;

  const employeeIds = [
    ...new Set([
      assessment.completed_by_employee_id,
      ...(assessment.responsible_person_id ? [assessment.responsible_person_id] : []),
      ...(hazards ?? []).map((h) => h.responsible_person_id).filter((id): id is string => Boolean(id)),
      ...(participants ?? []).map((p) => p.employee_id),
    ]),
  ];

  const { data: employees, error: employeesError } = await supabase.rpc("get_basic_employee_info", {
    target_employee_ids: employeeIds,
  });
  if (employeesError) throw employeesError;
  const employeeById = new Map((employees ?? []).map((e) => [e.id, e]));

  return {
    ...assessment,
    completedBy: employeeById.get(assessment.completed_by_employee_id) ?? null,
    responsiblePerson: assessment.responsible_person_id ? (employeeById.get(assessment.responsible_person_id) ?? null) : null,
    hazards: (hazards ?? [])
      .map((h) => ({ ...h, responsiblePerson: h.responsible_person_id ? (employeeById.get(h.responsible_person_id) ?? null) : null }))
      .sort((a, b) => a.hazard_type.localeCompare(b.hazard_type)),
    participants: (participants ?? [])
      .filter((p) => employeeById.has(p.employee_id))
      .map((p) => ({ ...p, employee: employeeById.get(p.employee_id) as BasicEmployee })),
  };
}

/**
 * Every LMRA assessment for `workDate` that `employeeId` is a listed
 * participant in — the Employee Dashboard's "Today's Safety" section
 * (Phase 4). Resolved via lmra_participants (RLS already grants a
 * participant read access to their own row — see
 * supabase/migrations/20260801090000_lmra.sql's lmra_participants_select),
 * then the matching assessments filtered to today's date. Two-step, not a
 * PostgREST embed, same convention as every other query in this file.
 */
export async function listMyLmraAssessmentsForDate(companyId: string, employeeId: string, workDate: string): Promise<LmraAssessment[]> {
  const supabase = await createClient();
  const { data: participantRows, error: participantError } = await supabase.from("lmra_participants").select("lmra_assessment_id").eq("company_id", companyId).eq("employee_id", employeeId);
  if (participantError) throw participantError;

  const assessmentIds = [...new Set((participantRows ?? []).map((row) => row.lmra_assessment_id))];
  if (assessmentIds.length === 0) return [];

  const { data, error } = await supabase.from("lmra_assessments").select("*").eq("company_id", companyId).eq("work_date", workDate).in("id", assessmentIds).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** True if the caller holds an active team_assignments row (assignment_role = 'foreman') for `projectId` — same underlying fact as the RLS helper is_project_foreman(), queried directly for UI-gating (show/hide the create/edit actions), never as the actual access-control decision. */
export async function isCallerProjectForeman(companyId: string, projectId: string, userId: string): Promise<boolean> {
  const supabase = await createClient();

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id")
    .eq("company_id", companyId)
    .eq("profile_id", userId)
    .maybeSingle();
  if (employeeError) throw employeeError;
  if (!employee) return false;

  const { data, error } = await supabase
    .from("team_assignments")
    .select("id")
    .eq("project_id", projectId)
    .eq("employee_id", employee.id)
    .eq("assignment_role", "foreman")
    .is("end_at", null)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/** Employee ids currently rostered onto `projectId` — the candidate pool for completed-by/responsible-person/workers-involved, same "only project-assigned employees are selectable" convention as modules/projects/queries.ts's listProjectRosterEmployeeIds. */
export async function listLmraCandidateEmployeeIds(companyId: string, projectId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_assignments")
    .select("employee_id")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .is("end_at", null);
  if (error) throw error;
  return [...new Set((data ?? []).map((row) => row.employee_id))];
}

/** Same candidate pool as `listLmraCandidateEmployeeIds`, resolved to display info via `get_basic_employee_info()` — what the worker picker, completed-by, and responsible-person fields actually render from. */
export async function listLmraCandidateEmployees(companyId: string, projectId: string): Promise<BasicEmployee[]> {
  const supabase = await createClient();
  const employeeIds = await listLmraCandidateEmployeeIds(companyId, projectId);
  if (employeeIds.length === 0) return [];

  const { data, error } = await supabase.rpc("get_basic_employee_info", { target_employee_ids: employeeIds });
  if (error) throw error;
  return (data ?? []).sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));
}

// ── Safety Overview aggregations ─────────────────────────────────────
// Every count here is a real, scoped query — no fabricated numbers. Where
// this milestone has no underlying data source yet (observations,
// corrective actions, scaffold inspections, incidents, toolbox talks,
// certificates — none of those modules exist), the page renders
// StatCard's "placeholder" variant instead of calling anything here; see
// app/(app)/safety-overview/page.tsx.

export type LmraOverviewCounts = {
  submittedToday: number;
  submittedThisWeek: number;
  overdueDrafts: number;
  openForReview: number;
  stopWork: number;
};

/**
 * Counts backing the Safety Overview's LMRA section. "Overdue" = a draft
 * whose work_date has already passed and was never submitted — the crew
 * was scheduled to do this task but no assessment was ever finalized for
 * it, which is itself a safety-relevant signal, not just a UI nicety.
 */
export async function getLmraOverviewCounts(companyId: string, projectId?: string): Promise<LmraOverviewCounts> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  function scoped() {
    let q = supabase.from("lmra_assessments").select("id", { count: "exact", head: true }).eq("company_id", companyId);
    if (projectId) q = q.eq("project_id", projectId);
    return q;
  }

  const [submittedToday, submittedThisWeek, overdueDrafts, openForReview, stopWork] = await Promise.all([
    scoped().eq("work_date", today).neq("status", "draft"),
    scoped().gte("work_date", weekStartStr).neq("status", "draft"),
    scoped().eq("status", "draft").lt("work_date", today),
    scoped().eq("status", "submitted"),
    scoped().eq("result", "no_go").neq("status", "draft"),
  ]);

  for (const r of [submittedToday, submittedThisWeek, overdueDrafts, openForReview, stopWork]) {
    if (r.error) throw r.error;
  }

  return {
    submittedToday: submittedToday.count ?? 0,
    submittedThisWeek: submittedThisWeek.count ?? 0,
    overdueDrafts: overdueDrafts.count ?? 0,
    openForReview: openForReview.count ?? 0,
    stopWork: stopWork.count ?? 0,
  };
}

/**
 * Recent LMRA activity for the Safety Overview's list section — the same
 * filters (project/work area/status/date) and ordering as `listLmraAssessments`
 * (the LMRA list page itself), just capped to `limit`. A thin wrapper rather
 * than a separate query so the two lists can never drift in what "recent"
 * means.
 */
export async function listRecentLmraForOverview(companyId: string, filters: LmraListFilters, limit: number): Promise<LmraAssessment[]> {
  const results = await listLmraAssessments(companyId, filters);
  return results.slice(0, limit);
}
