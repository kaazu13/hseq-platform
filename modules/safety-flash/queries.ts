import { createClient } from "@/lib/supabase/server";
import { createToolboxDocumentSignedUrl } from "@/lib/storage/toolbox-documents";
import type { SafetyFlash, SafetyFlashDetail, SafetyFlashFileReplacement } from "./types";
import type { Project } from "@/modules/projects/types";
import type { RoleName } from "@/modules/companies/types";

/** Server-only data access for Safety Flash — see docs/API_CONVENTIONS.md §7. */

export type SafetyFlashListFilters = {
  projectId?: string;
  category?: string;
  language?: string;
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
};

const MANAGE_ELIGIBLE_ROLES: RoleName[] = ["hse_officer"];

export async function isCallerProjectAccessible(projectId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_project_access", { target_project_id: projectId });
  if (error) throw error;
  return data ?? false;
}

export async function listSafetyFlashes(companyId: string, filters: SafetyFlashListFilters = {}): Promise<SafetyFlash[]> {
  const supabase = await createClient();
  let query = supabase.from("safety_flashes").select("*").eq("company_id", companyId);

  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.category) query = query.eq("category", filters.category as SafetyFlash["category"]);
  if (filters.language) query = query.eq("language", filters.language);
  if (filters.search) query = query.ilike("title", `%${filters.search}%`);
  if (filters.status) query = query.eq("status", filters.status as SafetyFlash["status"]);
  if (filters.dateFrom) query = query.gte("date_issued", filters.dateFrom);
  if (filters.dateTo) query = query.lte("date_issued", filters.dateTo);

  const { data, error } = await query.order("date_issued", { ascending: false }).order("flash_number", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listRecentSafetyFlashesForOverview(companyId: string, filters: SafetyFlashListFilters, limit: number): Promise<SafetyFlash[]> {
  const results = await listSafetyFlashes(companyId, filters);
  return results.slice(0, limit);
}

/**
 * Active Safety Flashes relevant to one employee — company-wide flashes
 * (project_id is null) unioned with flashes scoped specifically to
 * `projectId`, newest first. The Employee Dashboard's "Today's Safety"
 * section (Phase 4) — this module has no per-employee acknowledgement
 * state (it's a document-based evidence record, see this module's own
 * header comment elsewhere), so "relevant to them" is scope-based only:
 * every flash they'd actually be covered by, not a fabricated read/unread
 * status.
 */
export async function listActiveSafetyFlashesForEmployee(companyId: string, projectId: string, limit = 5): Promise<SafetyFlash[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("safety_flashes")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "active")
    .or(`project_id.is.null,project_id.eq.${projectId}`)
    .order("date_issued", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getSafetyFlash(companyId: string, flashId: string): Promise<SafetyFlashDetail | null> {
  const supabase = await createClient();
  const { data: flash, error } = await supabase.from("safety_flashes").select("*").eq("company_id", companyId).eq("id", flashId).maybeSingle();
  if (error) throw error;
  if (!flash) return null;

  const { data: employees, error: employeesError } = await supabase.rpc("get_toolbox_authorized_employee_info", { target_employee_ids: [flash.issued_by_employee_id] });
  if (employeesError) throw employeesError;

  return { ...flash, issuedBy: employees?.[0] ?? null };
}

export async function listSafetyFlashFileReplacements(flashId: string): Promise<SafetyFlashFileReplacement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("safety_flash_file_replacements").select("*").eq("safety_flash_id", flashId).order("replaced_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getSafetyFlashPreviewUrl(objectPath: string): Promise<string | null> {
  const supabase = await createClient();
  return createToolboxDocumentSignedUrl(supabase, objectPath);
}

/** Employees eligible to be "issued by" — hseq_manager company-wide, or hse_officer (assigned to `projectId`, or any hse_officer at all when projectId is null). */
export async function listSafetyFlashAuthorizedEmployees(companyId: string, projectId: string | null): Promise<{ id: string; first_name: string; last_name: string; employee_number: string; profile_id: string | null }[]> {
  const supabase = await createClient();
  // Supabase's generated Args type doesn't know this uuid parameter
  // accepts SQL NULL (list_toolbox_authorized_employees treats it as
  // "any hse_officer, not project-scoped" — see the migration) — the cast
  // reflects that gap, not an actual runtime constraint.
  const { data, error } = await supabase.rpc("list_toolbox_authorized_employees", { target_organization_id: companyId, target_project_id: projectId as string });
  if (error) throw error;
  return data ?? [];
}

/** Projects the caller may attach a Safety Flash to — same eligibility as listToolboxMeetingCreatableProjects. An empty/no-project flash is always an option regardless of this list (handled in the UI, not here). */
export async function listSafetyFlashCreatableProjects(companyId: string, userId: string, roleNames: RoleName[]): Promise<Project[]> {
  const supabase = await createClient();
  const isHseqManager = roleNames.includes("hseq_manager");

  if (isHseqManager) {
    const { data, error } = await supabase.from("projects").select("*").eq("company_id", companyId).neq("status", "archived").order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  if (!roleNames.some((role) => MANAGE_ELIGIBLE_ROLES.includes(role))) return [];

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

// ── Safety Overview aggregations ─────────────────────────────────────

export type SafetyFlashOverviewCounts = {
  issuedToday: number;
  issuedThisWeek: number;
  latest: SafetyFlash | null;
};

export async function getSafetyFlashOverviewCounts(companyId: string, projectId?: string): Promise<SafetyFlashOverviewCounts> {
  const supabase = await createClient();
  let query = supabase.from("safety_flashes").select("*").eq("company_id", companyId);
  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query.order("uploaded_at", { ascending: false });
  if (error) throw error;
  const flashes = data ?? [];

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfWeek = startOfToday - now.getDay() * 24 * 60 * 60 * 1000;

  let issuedToday = 0;
  let issuedThisWeek = 0;
  for (const flash of flashes) {
    const uploadedAt = new Date(flash.uploaded_at).getTime();
    if (uploadedAt >= startOfToday) issuedToday++;
    if (uploadedAt >= startOfWeek) issuedThisWeek++;
  }

  return {
    issuedToday,
    issuedThisWeek,
    latest: flashes[0] ?? null,
  };
}
