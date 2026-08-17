import { createClient } from "@/lib/supabase/server";
import type { AttendanceReviewRequest, AttendanceReviewRequestWithEmployee } from "./types";

/** The caller's OWN review requests — RLS-scoped (own employee row) regardless of what's passed here. */
export async function listMyAttendanceReviewRequests(companyId: string, employeeId: string, limit = 30): Promise<AttendanceReviewRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_review_requests")
    .select("*")
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** Every PENDING review request for a project — for the reviewer-facing queue. RLS (attendance_review_requests_select) independently scopes this to an authorized reviewer regardless of the filter here. Employee names resolved via the same get_basic_employee_info() "safe channel" every other cross-employee display uses. */
export async function listPendingAttendanceReviewRequests(companyId: string, projectId: string): Promise<AttendanceReviewRequestWithEmployee[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_review_requests")
    .select("*")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const employeeIds = [...new Set(data.map((request) => request.employee_id))];
  const { data: employees, error: employeesError } = await supabase.rpc("get_basic_employee_info", { target_employee_ids: employeeIds });
  if (employeesError) throw employeesError;
  const employeeById = new Map((employees ?? []).map((employee) => [employee.id, employee]));

  return data.flatMap((request) => {
    const employee = employeeById.get(request.employee_id);
    return employee ? [{ ...request, employee }] : [];
  });
}
