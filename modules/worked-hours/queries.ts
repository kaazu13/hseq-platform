import { createClient } from "@/lib/supabase/server";
import type { AppNotification, MonthlyWorkedHoursRow, WorkedHours, WorkedHoursCorrection, WorkedHoursDiscrepancy, WorkedHoursWithEmployee } from "./types";
import type { BasicEmployee } from "@/modules/daily-workforce/types";

/**
 * Server-only data access for the Worked Hours domain — see
 * docs/API_CONVENTIONS.md §7. No PostgREST embeds, same reason as every
 * other module this session.
 */

/** Every worked_hours row for (project, work_date), resolved with each employee's display name — the Worked Hours day view's single data source. */
export async function listWorkedHoursForDate(companyId: string, projectId: string, workDate: string): Promise<WorkedHoursWithEmployee[]> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("worked_hours")
    .select("*")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .eq("work_date", workDate);
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const employeeIds = [...new Set(rows.map((row) => row.employee_id))];
  const { data: employees, error: employeesError } = await supabase.rpc("get_basic_employee_info", { target_employee_ids: employeeIds });
  if (employeesError) throw employeesError;
  const employeeById = new Map((employees ?? []).map((employee) => [employee.id, employee]));

  return rows
    .map((row) => ({ ...row, employee: employeeById.get(row.employee_id) }))
    .filter((row): row is WorkedHoursWithEmployee => Boolean(row.employee))
    .sort((a, b) => {
      const lastNameCompare = a.employee.last_name.localeCompare(b.employee.last_name);
      return lastNameCompare !== 0 ? lastNameCompare : a.employee.first_name.localeCompare(b.employee.first_name);
    });
}

/** A single employee's worked_hours row for a date — null if none recorded yet. */
export async function getWorkedHours(companyId: string, projectId: string, employeeId: string, workDate: string): Promise<WorkedHours | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("worked_hours")
    .select("*")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .eq("employee_id", employeeId)
    .eq("work_date", workDate)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** A single worked_hours row by id, scoped to companyId — used to resolve the parent row before reporting/reviewing a discrepancy. */
export async function getWorkedHoursById(companyId: string, workedHoursId: string): Promise<WorkedHours | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("worked_hours").select("*").eq("company_id", companyId).eq("id", workedHoursId).maybeSingle();
  if (error) throw error;
  return data;
}

/** The full correction history for one worked_hours row, oldest first — "10.0h -> 8.0h, reason: ..." trail. */
export async function listWorkedHoursCorrections(companyId: string, workedHoursId: string): Promise<WorkedHoursCorrection[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("worked_hours_corrections")
    .select("*")
    .eq("company_id", companyId)
    .eq("worked_hours_id", workedHoursId)
    .order("changed_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Every employee currently rostered onto `projectId` (an active project_assignments row) — the bulk-apply picker's candidate list, same roster query shape as modules/daily-workforce/queries.ts's listWorkforceForDate but without the attendance/team join (Worked Hours doesn't gate on attendance status). */
export async function listProjectRosterEmployees(companyId: string, projectId: string): Promise<BasicEmployee[]> {
  const supabase = await createClient();
  const { data: roster, error: rosterError } = await supabase
    .from("project_assignments")
    .select("employee_id")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .is("end_at", null);
  if (rosterError) throw rosterError;
  const employeeIds = [...new Set((roster ?? []).map((row) => row.employee_id))];
  if (employeeIds.length === 0) return [];

  const { data: employees, error: employeesError } = await supabase.rpc("get_basic_employee_info", { target_employee_ids: employeeIds });
  if (employeesError) throw employeesError;
  return (employees ?? []).sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));
}

/** Every worked_hours row for a project within [fromDate, toDate] inclusive, pivoted into one row per employee with hours keyed by date — the Worked Hours "This Month" view's single data source. */
export async function listMonthlyWorkedHours(companyId: string, projectId: string, fromDate: string, toDate: string): Promise<MonthlyWorkedHoursRow[]> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("worked_hours")
    .select("employee_id, work_date, hours")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .gte("work_date", fromDate)
    .lte("work_date", toDate);
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const employeeIds = [...new Set(rows.map((row) => row.employee_id))];
  const { data: employees, error: employeesError } = await supabase.rpc("get_basic_employee_info", { target_employee_ids: employeeIds });
  if (employeesError) throw employeesError;
  const employeeById = new Map((employees ?? []).map((employee) => [employee.id, employee]));

  const byEmployeeId = new Map<string, MonthlyWorkedHoursRow>();
  for (const row of rows) {
    const employee = employeeById.get(row.employee_id);
    if (!employee) continue;
    const existing = byEmployeeId.get(row.employee_id) ?? { employee, hoursByDate: {}, totalHours: 0 };
    existing.hoursByDate[row.work_date] = Number(row.hours);
    existing.totalHours += Number(row.hours);
    byEmployeeId.set(row.employee_id, existing);
  }

  return [...byEmployeeId.values()].sort((a, b) => {
    const lastNameCompare = a.employee.last_name.localeCompare(b.employee.last_name);
    return lastNameCompare !== 0 ? lastNameCompare : a.employee.first_name.localeCompare(b.employee.first_name);
  });
}

export type WorkedHoursArchiveDay = {
  workDate: string;
  employeeCount: number;
  totalHours: number;
  draftCount: number;
  submittedCount: number;
};

/** Every distinct date this project has recorded worked hours, newest first — the Worked Hours Archive view's list. */
export async function listWorkedHoursArchiveDays(companyId: string, projectId: string, limit = 60): Promise<WorkedHoursArchiveDay[]> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("worked_hours")
    .select("work_date, hours, status")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .order("work_date", { ascending: false });
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const byDate = new Map<string, WorkedHoursArchiveDay>();
  for (const row of rows) {
    const existing = byDate.get(row.work_date) ?? { workDate: row.work_date, employeeCount: 0, totalHours: 0, draftCount: 0, submittedCount: 0 };
    existing.employeeCount += 1;
    existing.totalHours += Number(row.hours);
    if (row.status === "draft") existing.draftCount += 1;
    else existing.submittedCount += 1;
    byDate.set(row.work_date, existing);
  }

  return [...byDate.values()].slice(0, limit);
}

/** Open worked-hours discrepancies for a project — the PM/Admin review queue. */
export async function listOpenWorkedHoursDiscrepancies(companyId: string, projectId: string): Promise<(WorkedHoursDiscrepancy & { employee: BasicEmployee; workedHours: WorkedHours })[]> {
  const supabase = await createClient();
  const { data: discrepancies, error } = await supabase
    .from("worked_hours_discrepancies")
    .select("*")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .eq("status", "open")
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (!discrepancies || discrepancies.length === 0) return [];

  const employeeIds = [...new Set(discrepancies.map((d) => d.employee_id))];
  const workedHoursIds = [...new Set(discrepancies.map((d) => d.worked_hours_id))];
  const [{ data: employees, error: employeesError }, { data: workedHoursRows, error: workedHoursError }] = await Promise.all([
    supabase.rpc("get_basic_employee_info", { target_employee_ids: employeeIds }),
    supabase.from("worked_hours").select("*").in("id", workedHoursIds),
  ]);
  if (employeesError) throw employeesError;
  if (workedHoursError) throw workedHoursError;

  const employeeById = new Map((employees ?? []).map((employee) => [employee.id, employee]));
  const workedHoursById = new Map((workedHoursRows ?? []).map((row) => [row.id, row]));

  return discrepancies
    .map((d) => ({ ...d, employee: employeeById.get(d.employee_id), workedHours: workedHoursById.get(d.worked_hours_id) }))
    .filter((d): d is WorkedHoursDiscrepancy & { employee: BasicEmployee; workedHours: WorkedHours } => Boolean(d.employee && d.workedHours));
}

/** A single employee's own discrepancy reports (any status) — the Employee Dashboard's "pending hour corrections/discrepancies" section. */
export async function listMyWorkedHoursDiscrepancies(companyId: string, employeeId: string): Promise<WorkedHoursDiscrepancy[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("worked_hours_discrepancies")
    .select("*")
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** An employee's total credited hours for a project from the first of `asOfDate`'s month up to and including `asOfDate` — the Employee Dashboard's "Hours this month up to current date." */
export async function getEmployeeMonthToDateHours(companyId: string, projectId: string, employeeId: string, asOfDate: string): Promise<number> {
  const supabase = await createClient();
  const monthStart = `${asOfDate.slice(0, 7)}-01`;
  const { data, error } = await supabase
    .from("worked_hours")
    .select("hours")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .eq("employee_id", employeeId)
    .gte("work_date", monthStart)
    .lte("work_date", asOfDate);
  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + Number(row.hours), 0);
}

/** An unread-first page of a user's own notifications — the Employee Dashboard's "Notifications / actions required" section. Always scoped to `recipient_user_id = auth.uid()` by RLS, never client-filterable to another user. */
export async function listMyNotifications(limit = 20): Promise<AppNotification[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("read_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
