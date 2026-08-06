import { createClient } from "@/lib/supabase/server";
import { createToolboxDocumentSignedUrl } from "@/lib/storage/toolbox-documents";
import type { ToolboxMeeting, ToolboxMeetingDetail, ToolboxMeetingFileReplacement } from "./types";
import type { Project } from "@/modules/projects/types";
import type { RoleName } from "@/modules/companies/types";

/**
 * Server-only data access for Toolbox Meetings — see
 * docs/API_CONVENTIONS.md §7. Plain queries filtered explicitly by
 * `company_id` (RLS also enforces this); no PostgREST embeds, same
 * convention as every other module this session.
 */

export type ToolboxMeetingListFilters = {
  projectId?: string;
  status?: string;
  search?: string;
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

export async function listToolboxMeetings(companyId: string, filters: ToolboxMeetingListFilters = {}): Promise<ToolboxMeeting[]> {
  const supabase = await createClient();
  let query = supabase.from("toolbox_meetings").select("*").eq("company_id", companyId);

  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.status) query = query.eq("status", filters.status as ToolboxMeeting["status"]);
  if (filters.search) query = query.ilike("title", `%${filters.search}%`);
  if (filters.dateFrom) query = query.gte("meeting_date", filters.dateFrom);
  if (filters.dateTo) query = query.lte("meeting_date", filters.dateTo);

  const { data, error } = await query.order("meeting_date", { ascending: false }).order("meeting_number", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listRecentToolboxMeetingsForOverview(companyId: string, filters: ToolboxMeetingListFilters, limit: number): Promise<ToolboxMeeting[]> {
  const results = await listToolboxMeetings(companyId, filters);
  return results.slice(0, limit);
}

export async function getToolboxMeeting(companyId: string, meetingId: string): Promise<ToolboxMeetingDetail | null> {
  const supabase = await createClient();
  const { data: meeting, error } = await supabase.from("toolbox_meetings").select("*").eq("company_id", companyId).eq("id", meetingId).maybeSingle();
  if (error) throw error;
  if (!meeting) return null;

  const { data: employees, error: employeesError } = await supabase.rpc("get_toolbox_authorized_employee_info", { target_employee_ids: [meeting.held_by_employee_id] });
  if (employeesError) throw employeesError;

  return { ...meeting, heldBy: employees?.[0] ?? null };
}

export async function listToolboxMeetingFileReplacements(meetingId: string): Promise<ToolboxMeetingFileReplacement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("toolbox_meeting_file_replacements").select("*").eq("toolbox_meeting_id", meetingId).order("replaced_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** A short-lived signed URL for previewing/downloading a meeting's current PDF. */
export async function getToolboxMeetingPreviewUrl(objectPath: string): Promise<string | null> {
  const supabase = await createClient();
  return createToolboxDocumentSignedUrl(supabase, objectPath);
}

/** Employees eligible to be "the HSE person who held the meeting" for `projectId` — hseq_manager company-wide, or hse_officer assigned to that project. */
export async function listToolboxAuthorizedEmployees(companyId: string, projectId: string): Promise<{ id: string; first_name: string; last_name: string; employee_number: string; profile_id: string | null }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_toolbox_authorized_employees", { target_organization_id: companyId, target_project_id: projectId });
  if (error) throw error;
  return data ?? [];
}

/** Projects the caller can create a toolbox meeting for — company-wide (every non-archived project) if hseq_manager, otherwise every project where they hold a current hse_officer-eligible assignment. Mirrors modules/scaffolds/queries.ts's listScaffoldCreatableProjects exactly, including the "role-gated, not just any project_assignments row" fix. */
export async function listToolboxMeetingCreatableProjects(companyId: string, userId: string, roleNames: RoleName[]): Promise<Project[]> {
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

export type ToolboxMeetingOverviewCounts = {
  uploadedToday: number;
  uploadedThisWeek: number;
  latest: ToolboxMeeting | null;
};

export async function getToolboxMeetingOverviewCounts(companyId: string, projectId?: string): Promise<ToolboxMeetingOverviewCounts> {
  const supabase = await createClient();
  let query = supabase.from("toolbox_meetings").select("*").eq("company_id", companyId);
  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query.order("uploaded_at", { ascending: false });
  if (error) throw error;
  const meetings = data ?? [];

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfWeek = startOfToday - now.getDay() * 24 * 60 * 60 * 1000;

  let uploadedToday = 0;
  let uploadedThisWeek = 0;
  for (const meeting of meetings) {
    const uploadedAt = new Date(meeting.uploaded_at).getTime();
    if (uploadedAt >= startOfToday) uploadedToday++;
    if (uploadedAt >= startOfWeek) uploadedThisWeek++;
  }

  return {
    uploadedToday,
    uploadedThisWeek,
    latest: meetings[0] ?? null,
  };
}
