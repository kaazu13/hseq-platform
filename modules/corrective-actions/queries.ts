import { createClient } from "@/lib/supabase/server";
import type { CorrectiveAction, CorrectiveActionDetail, BasicEmployee } from "./types";

/**
 * Server-only data access for the Corrective Actions domain — see
 * docs/API_CONVENTIONS.md §7. Plain queries filtered explicitly by
 * `organization_id` (RLS also enforces this — see
 * supabase/migrations/20260802120000_safety_observations_and_corrective_actions.sql
 * — but explicit scoping keeps index usage and intent readable).
 */

/** True if the calling user holds an active project_assignments row with assignment_role = 'project_manager' for `projectId` — same underlying fact is_project_manager() (the RLS/trigger helper) checks, queried directly for UI-gating. */
export async function isCallerProjectManager(projectId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_project_manager", { target_project_id: projectId });
  if (error) throw error;
  return data ?? false;
}

async function resolveResponsiblePersons(supabase: Awaited<ReturnType<typeof createClient>>, actions: CorrectiveAction[]): Promise<Map<string, BasicEmployee>> {
  const employeeIds = [...new Set(actions.map((a) => a.responsible_person_id))];
  if (employeeIds.length === 0) return new Map();
  const { data, error } = await supabase.rpc("get_basic_employee_info", { target_employee_ids: employeeIds });
  if (error) throw error;
  return new Map((data ?? []).map((e) => [e.id, e]));
}

/** Every corrective action for one observation — RLS (corrective_actions_select) does the real scoping. Oldest first (the order they were raised). */
export async function listCorrectiveActionsForObservation(organizationId: string, observationId: string): Promise<CorrectiveActionDetail[]> {
  const supabase = await createClient();
  const { data: actions, error } = await supabase
    .from("corrective_actions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("observation_id", observationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (!actions || actions.length === 0) return [];

  const responsibleById = await resolveResponsiblePersons(supabase, actions);
  return actions.map((action) => ({ ...action, responsiblePerson: responsibleById.get(action.responsible_person_id) ?? null }));
}

/** A single corrective action scoped to `organizationId` — null if it doesn't exist, belongs to another org, or RLS hides it. */
export async function getCorrectiveAction(organizationId: string, actionId: string): Promise<CorrectiveActionDetail | null> {
  const supabase = await createClient();
  const { data: action, error } = await supabase
    .from("corrective_actions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", actionId)
    .maybeSingle();
  if (error) throw error;
  if (!action) return null;

  const responsibleById = await resolveResponsiblePersons(supabase, [action]);
  return { ...action, responsiblePerson: responsibleById.get(action.responsible_person_id) ?? null };
}

/** Employee ids currently rostered onto `projectId` — the candidate pool for the responsible-person select, same convention as modules/observations/queries.ts's listObservationCandidateEmployees. */
export async function listCorrectiveActionCandidateEmployees(organizationId: string, projectId: string): Promise<BasicEmployee[]> {
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

  const { data: employees, error: employeesError } = await supabase.rpc("get_basic_employee_info", {
    target_employee_ids: employeeIds,
  });
  if (employeesError) throw employeesError;
  return (employees ?? []).sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));
}

// ── Safety Overview aggregations ─────────────────────────────────────

export type CorrectiveActionOverviewCounts = {
  open: number;
  overdue: number;
  awaitingVerification: number;
};

/**
 * Counts backing the Safety Overview's Corrective Actions section. "Open"
 * counts every unresolved status (open/in_progress/awaiting_verification —
 * matches UNRESOLVED_CORRECTIVE_ACTION_STATUSES). "Overdue" is derived via
 * the same due_date/status filter as isCorrectiveActionOverdue() (see
 * modules/corrective-actions/types.ts's comment on why there's no separate
 * SQL function for this — a plain PostgREST filter expresses it exactly).
 */
export async function getCorrectiveActionOverviewCounts(organizationId: string, projectId?: string): Promise<CorrectiveActionOverviewCounts> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  function scoped() {
    let q = supabase.from("corrective_actions").select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
    if (projectId) q = q.eq("project_id", projectId);
    return q;
  }

  const [open, overdue, awaitingVerification] = await Promise.all([
    scoped().in("status", ["open", "in_progress", "awaiting_verification"]),
    scoped().lt("due_date", today).not("status", "in", "(closed,rejected)"),
    scoped().eq("status", "awaiting_verification"),
  ]);

  for (const r of [open, overdue, awaitingVerification]) {
    if (r.error) throw r.error;
  }

  return {
    open: open.count ?? 0,
    overdue: overdue.count ?? 0,
    awaitingVerification: awaitingVerification.count ?? 0,
  };
}
