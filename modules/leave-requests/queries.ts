import { createClient } from "@/lib/supabase/server";
import type { BasicEmployee } from "@/modules/daily-workforce/types";
import type { LeaveRequest, LeaveRequestWithEmployee, LeaveRequestHistory, LeaveRequestStatus } from "./types";

/**
 * Server-only data access for Holiday/Leave requests (Phases 8-10). Same
 * "no PostgREST embeds, batched follow-ups merged in JS" convention as
 * every other module this session.
 */

async function attachEmployees<T extends { employee_id: string }>(rows: T[]): Promise<(T & { employee: BasicEmployee })[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const employeeIds = [...new Set(rows.map((row) => row.employee_id))];
  const { data: employees, error } = await supabase.rpc("get_basic_employee_info", { target_employee_ids: employeeIds });
  if (error) throw error;
  const employeeById = new Map((employees ?? []).map((employee) => [employee.id, employee]));
  return rows.flatMap((row) => {
    const employee = employeeById.get(row.employee_id);
    return employee ? [{ ...row, employee }] : [];
  });
}

/** Every leave request for a project, optionally filtered by status/date range/employee — the management view's single data source (Phase 9). */
export async function listLeaveRequestsForProject(
  companyId: string,
  projectId: string,
  filters?: { statuses?: LeaveRequestStatus[]; fromDate?: string; toDate?: string; employeeId?: string },
): Promise<LeaveRequestWithEmployee[]> {
  const supabase = await createClient();
  let query = supabase.from("leave_requests").select("*").eq("company_id", companyId).eq("project_id", projectId).order("requested_at", { ascending: false });
  if (filters?.statuses && filters.statuses.length > 0) query = query.in("status", filters.statuses);
  if (filters?.fromDate) query = query.gte("end_date", filters.fromDate);
  if (filters?.toDate) query = query.lte("start_date", filters.toDate);
  if (filters?.employeeId) query = query.eq("employee_id", filters.employeeId);

  const { data, error } = await query;
  if (error) throw error;
  return attachEmployees(data ?? []);
}

/** A single leave request scoped to company/project — null if it doesn't exist or belongs elsewhere. */
export async function getLeaveRequest(companyId: string, projectId: string, leaveRequestId: string): Promise<LeaveRequest | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("leave_requests").select("*").eq("company_id", companyId).eq("project_id", projectId).eq("id", leaveRequestId).maybeSingle();
  if (error) throw error;
  return data;
}

/** The calling employee's own leave requests, newest first — "Employee sees only their own leave requests" (Phase 9). */
export async function listMyLeaveRequests(companyId: string, employeeId: string, limit = 50): Promise<LeaveRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("leave_requests").select("*").eq("company_id", companyId).eq("employee_id", employeeId).order("requested_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** The full audit trail for one leave request — every status transition ("Preserve request history/audit trail"). */
export async function listLeaveRequestHistory(leaveRequestId: string): Promise<LeaveRequestHistory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("leave_request_history").select("*").eq("leave_request_id", leaveRequestId).order("changed_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Resolves display names for the managers who decided a set of leave requests ("Decided by" export column) — the one sanctioned channel (get_basic_profile_info), scoped to companyId. */
export async function resolveDeciderNames(companyId: string, userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_basic_profile_info", { target_company_id: companyId, target_user_ids: ids });
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row.full_name]));
}

/** Every employee currently on APPROVED leave covering `workDate` — used by Today's Teams/Absent Today to show why someone is unavailable without a separate daily_attendance lookup being the only signal. */
export async function listApprovedLeaveForDate(companyId: string, projectId: string, workDate: string): Promise<LeaveRequestWithEmployee[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leave_requests")
    .select("*")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .eq("status", "approved")
    .lte("start_date", workDate)
    .gte("end_date", workDate);
  if (error) throw error;
  return attachEmployees(data ?? []);
}
