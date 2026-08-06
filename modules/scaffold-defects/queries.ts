import { createClient } from "@/lib/supabase/server";
import type { ScaffoldDefect, ScaffoldDefectDetail, BasicEmployee } from "./types";

/**
 * Server-only data access for the Scaffold Defects domain — see
 * docs/API_CONVENTIONS.md §7. Mirrors modules/corrective-actions/queries.ts
 * closely.
 */

async function resolveResponsiblePersons(supabase: Awaited<ReturnType<typeof createClient>>, defects: ScaffoldDefect[]): Promise<Map<string, BasicEmployee>> {
  const employeeIds = [...new Set(defects.map((d) => d.responsible_person_id))];
  if (employeeIds.length === 0) return new Map();
  const { data, error } = await supabase.rpc("get_basic_employee_info", { target_employee_ids: employeeIds });
  if (error) throw error;
  return new Map((data ?? []).map((e) => [e.id, e]));
}

/** Every defect for one inspection, oldest first (the order they were raised). */
export async function listDefectsForInspection(companyId: string, inspectionId: string): Promise<ScaffoldDefectDetail[]> {
  const supabase = await createClient();
  const { data: defects, error } = await supabase
    .from("scaffold_defects")
    .select("*")
    .eq("company_id", companyId)
    .eq("scaffold_inspection_id", inspectionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (!defects || defects.length === 0) return [];

  const responsibleById = await resolveResponsiblePersons(supabase, defects);
  return defects.map((defect) => ({ ...defect, responsiblePerson: responsibleById.get(defect.responsible_person_id) ?? null }));
}

/** Every defect currently open against a scaffold, across all of its inspections — what a scaffold's "unresolved history" looks like at a glance. */
export async function listDefectsForScaffold(companyId: string, scaffoldId: string): Promise<ScaffoldDefectDetail[]> {
  const supabase = await createClient();
  const { data: defects, error } = await supabase
    .from("scaffold_defects")
    .select("*")
    .eq("company_id", companyId)
    .eq("scaffold_id", scaffoldId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!defects || defects.length === 0) return [];

  const responsibleById = await resolveResponsiblePersons(supabase, defects);
  return defects.map((defect) => ({ ...defect, responsiblePerson: responsibleById.get(defect.responsible_person_id) ?? null }));
}

/** A single defect scoped to `companyId` — null if it doesn't exist, belongs to another company, or RLS hides it. */
export async function getScaffoldDefect(companyId: string, defectId: string): Promise<ScaffoldDefectDetail | null> {
  const supabase = await createClient();
  const { data: defect, error } = await supabase.from("scaffold_defects").select("*").eq("company_id", companyId).eq("id", defectId).maybeSingle();
  if (error) throw error;
  if (!defect) return null;

  const responsibleById = await resolveResponsiblePersons(supabase, [defect]);
  return { ...defect, responsiblePerson: responsibleById.get(defect.responsible_person_id) ?? null };
}

/** Employee ids currently rostered onto `projectId` — the candidate pool for the responsible-person select, same convention as every other module this session. */
export async function listScaffoldDefectCandidateEmployees(companyId: string, projectId: string): Promise<BasicEmployee[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_assignments").select("employee_id").eq("company_id", companyId).eq("project_id", projectId).is("end_at", null);
  if (error) throw error;
  const employeeIds = [...new Set((data ?? []).map((row) => row.employee_id))];
  if (employeeIds.length === 0) return [];

  const { data: employees, error: employeesError } = await supabase.rpc("get_basic_employee_info", { target_employee_ids: employeeIds });
  if (employeesError) throw employeesError;
  return (employees ?? []).sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));
}

// ── Safety Overview aggregations ─────────────────────────────────────

export type ScaffoldDefectOverviewCounts = {
  open: number;
  overdue: number;
  awaitingVerification: number;
};

/** Counts backing the Safety Overview's Scaffold Defects section — mirrors modules/corrective-actions/queries.ts's getCorrectiveActionOverviewCounts() exactly. */
export async function getScaffoldDefectOverviewCounts(companyId: string, projectId?: string): Promise<ScaffoldDefectOverviewCounts> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  function scoped() {
    let q = supabase.from("scaffold_defects").select("id", { count: "exact", head: true }).eq("company_id", companyId);
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
