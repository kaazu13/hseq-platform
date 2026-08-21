import { createClient } from "@/lib/supabase/server";
import type { EmployeeRateRequest, EmployeeRateRequestWithEmployee, EmployeeRateRequestStatus } from "./types";

/** The calling employee's own rate requests, newest first — RLS (employee_rate_requests_select) already scopes this to "own only" for a plain employee, so no explicit employeeId filter is needed beyond what RLS already guarantees; passed anyway for an explicit, auditable query shape. */
export async function listMyRateRequests(companyId: string, employeeId: string): Promise<EmployeeRateRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("employee_rate_requests").select("*").eq("company_id", companyId).eq("employee_id", employeeId).order("submitted_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Company-wide (reviewer) or project-scoped (read-only PM) rate request
 * list — RLS itself is what actually narrows a PM's results to their own
 * project's employees (employee_rate_requests_select); this query never
 * re-derives that scoping in JS, it just applies the UI's own optional
 * filters on top of whatever RLS already returned.
 */
export async function listCompanyRateRequests(
  companyId: string,
  filters?: { status?: EmployeeRateRequestStatus; employeeSearch?: string; fromDate?: string; toDate?: string },
): Promise<EmployeeRateRequestWithEmployee[]> {
  const supabase = await createClient();
  let query = supabase.from("employee_rate_requests").select("*").eq("company_id", companyId).order("submitted_at", { ascending: false });
  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.fromDate) query = query.gte("submitted_at", filters.fromDate);
  if (filters?.toDate) query = query.lte("submitted_at", filters.toDate);

  const { data: rows, error } = await query;
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const employeeIds = [...new Set(rows.map((row) => row.employee_id))];
  const [{ data: employees, error: employeesError }, { data: assignments, error: assignmentsError }] = await Promise.all([
    supabase.rpc("get_basic_employee_info", { target_employee_ids: employeeIds }),
    supabase.from("project_assignments").select("employee_id, project_id").eq("company_id", companyId).is("end_at", null).in("employee_id", employeeIds),
  ]);
  if (employeesError) throw employeesError;
  if (assignmentsError) throw assignmentsError;

  const projectIds = [...new Set((assignments ?? []).map((row) => row.project_id))];
  const { data: projects, error: projectsError } = projectIds.length > 0 ? await supabase.from("projects").select("id, name").in("id", projectIds) : { data: [], error: null };
  if (projectsError) throw projectsError;
  const projectNameById = new Map((projects ?? []).map((p) => [p.id, p.name]));

  const employeeById = new Map((employees ?? []).map((e) => [e.id, e]));
  const projectNamesByEmployeeId = new Map<string, string[]>();
  for (const row of assignments ?? []) {
    const projectName = projectNameById.get(row.project_id);
    if (!projectName) continue;
    const list = projectNamesByEmployeeId.get(row.employee_id) ?? [];
    list.push(projectName);
    projectNamesByEmployeeId.set(row.employee_id, list);
  }

  const query2 = filters?.employeeSearch?.trim().toLowerCase();
  return rows
    .map((row): EmployeeRateRequestWithEmployee | null => {
      const employee = employeeById.get(row.employee_id);
      if (!employee) return null;
      return { ...row, employee: { id: employee.id, first_name: employee.first_name, last_name: employee.last_name }, projectNames: projectNamesByEmployeeId.get(row.employee_id) ?? [] };
    })
    .filter((row): row is EmployeeRateRequestWithEmployee => row !== null)
    .filter((row) => !query2 || `${row.employee.first_name} ${row.employee.last_name}`.toLowerCase().includes(query2));
}

export async function getRateRequest(companyId: string, requestId: string): Promise<EmployeeRateRequest | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("employee_rate_requests").select("*").eq("company_id", companyId).eq("id", requestId).maybeSingle();
  if (error) throw error;
  return data;
}
