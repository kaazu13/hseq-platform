import { createClient } from "@/lib/supabase/server";
import type { AppNotification, WorkedHoursMatrixRow, WorkedHours, WorkedHoursCorrection, WorkedHoursDiscrepancy, WorkedHoursWithEmployee } from "./types";
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

/** The employee's most recently recorded worked_hours row for a project, regardless of date — the Employee Dashboard's "today's/latest credited hours" data source. */
export async function getLatestWorkedHours(companyId: string, projectId: string, employeeId: string): Promise<WorkedHours | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("worked_hours")
    .select("*")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .eq("employee_id", employeeId)
    .order("work_date", { ascending: false })
    .limit(1)
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

/** Every worked_hours row for a project within [fromDate, toDate] inclusive, pivoted into one row per employee with hours keyed by date — the Worked Hours "This Month" view's and the Week/Month export's single data source. `employeeIds`, when given, restricts the result to exactly those employees (the "selected workers" export scope) — still always scoped to this one company/project regardless. */
export async function listWorkedHoursForPeriod(companyId: string, projectId: string, fromDate: string, toDate: string, employeeIds?: string[]): Promise<WorkedHoursMatrixRow[]> {
  const supabase = await createClient();
  let query = supabase.from("worked_hours").select("employee_id, work_date, hours").eq("company_id", companyId).eq("project_id", projectId).gte("work_date", fromDate).lte("work_date", toDate);
  if (employeeIds) query = query.in("employee_id", employeeIds);
  const { data: rows, error } = await query;
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const foundEmployeeIds = [...new Set(rows.map((row) => row.employee_id))];
  const { data: employees, error: employeesError } = await supabase.rpc("get_basic_employee_info", { target_employee_ids: foundEmployeeIds });
  if (employeesError) throw employeesError;
  const employeeById = new Map((employees ?? []).map((employee) => [employee.id, employee]));

  const byEmployeeId = new Map<string, WorkedHoursMatrixRow>();
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

/** Every employee assigned/eligible in this project at any point during [fromDate, toDate] — the union of (a) a project_assignments row overlapping the period and (b) anyone who already has a worked_hours row inside it (covers a since-ended assignment that still has recorded hours in-period). Backs the "All project workers" export scope (Phase 6) and the "selected workers" picker's candidate list — deliberately never company-wide, always scoped to this one project_id. */
export async function listProjectWorkersForPeriod(companyId: string, projectId: string, fromDate: string, toDate: string): Promise<BasicEmployee[]> {
  const supabase = await createClient();
  const periodStart = `${fromDate}T00:00:00.000Z`;
  const periodEnd = `${toDate}T23:59:59.999Z`;

  const [{ data: assignments, error: assignmentsError }, { data: hoursRows, error: hoursError }] = await Promise.all([
    supabase
      .from("project_assignments")
      .select("employee_id")
      .eq("company_id", companyId)
      .eq("project_id", projectId)
      .lte("start_at", periodEnd)
      .or(`end_at.is.null,end_at.gte.${periodStart}`),
    supabase.from("worked_hours").select("employee_id").eq("company_id", companyId).eq("project_id", projectId).gte("work_date", fromDate).lte("work_date", toDate),
  ]);
  if (assignmentsError) throw assignmentsError;
  if (hoursError) throw hoursError;

  const employeeIds = [...new Set([...(assignments ?? []).map((row) => row.employee_id), ...(hoursRows ?? []).map((row) => row.employee_id)])];
  if (employeeIds.length === 0) return [];

  const { data: employees, error: employeesError } = await supabase.rpc("get_basic_employee_info", { target_employee_ids: employeeIds });
  if (employeesError) throw employeesError;
  return (employees ?? []).sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));
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

/** An unread-first page of a user's own notifications — the Employee Dashboard's "Notifications / actions required" section, and the full Notification Center page. Always scoped to `recipient_user_id = auth.uid()` by RLS, never client-filterable to another user. */
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

/** The caller's own unread notification count — the top bar bell badge's single data source. A lightweight `head: true` count, never the full row set, since it renders on every page via app/(app)/layout.tsx. RLS-scoped to `recipient_user_id = auth.uid()` the same as listMyNotifications. */
export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

/**
 * One employee's individual worked_hours rows (not pivoted) across
 * [fromDate, toDate], newest first — the "My Hours" page's history-list
 * data source (Phase 2). Distinct from listWorkedHoursForPeriod (which
 * pivots into one row per employee for the payroll matrix/"This Month"
 * views) — this stays one row per DAY so each day's status/note/id (needed
 * for corrections + "Report discrepancy") is directly available.
 * `employeeId` must already be verified as the caller's own — callers
 * resolve it via getMyEmployeeId() first, same convention as every other
 * "my own data" query in this codebase; RLS backstops it regardless.
 */
export async function listWorkedHoursHistoryForEmployee(companyId: string, projectId: string, employeeId: string, fromDate: string, toDate: string): Promise<WorkedHours[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("worked_hours")
    .select("*")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .eq("employee_id", employeeId)
    .gte("work_date", fromDate)
    .lte("work_date", toDate)
    .order("work_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
