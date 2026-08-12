import { createClient } from "@/lib/supabase/server";
import { listWorkforceForDate } from "@/modules/daily-workforce/queries";
import { dailyAttendancePermitsWork } from "@/modules/daily-workforce/types";
import type { BasicEmployee } from "@/modules/daily-workforce/types";
import type { AbsentTodayRow, DailyAttendanceDayLock, AbsenceReportWithEmployee } from "./types";

/**
 * Server-only data access for Absence management (Phases 4-7). Reuses
 * listWorkforceForDate() (modules/daily-workforce/queries.ts) as the single
 * source of truth for who's on the roster and their current status — this
 * module only filters/reshapes that same data, never queries
 * daily_attendance independently for the "who's absent" view.
 */

/** Every currently-rostered employee whose attendance status does NOT permit work for `workDate` — "Absent Today." Deliberately excludes 'not_set' (Phase 4: "not assigned" is not "absent"). */
export async function listAbsentToday(companyId: string, projectId: string, workDate: string): Promise<AbsentTodayRow[]> {
  const workforce = await listWorkforceForDate(companyId, projectId, workDate);
  return workforce
    .filter((state) => state.attendanceStatus !== "not_set" && !dailyAttendancePermitsWork(state.attendanceStatus))
    .map((state) => ({ employee: state.employee, status: state.attendanceStatus, note: state.attendanceNote }));
}

/** The current close/lock state for (project, work_date) — null if it has never been closed. */
export async function getAbsenceDayLock(companyId: string, projectId: string, workDate: string): Promise<DailyAttendanceDayLock | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_attendance_day_locks")
    .select("*")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .eq("work_date", workDate)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Every self-reported absence for (project, work_date), newest first — the review list distinguishing "Reported by employee" from any later management confirm/reject. */
export async function listAbsenceReportsForDate(companyId: string, projectId: string, workDate: string): Promise<AbsenceReportWithEmployee[]> {
  const supabase = await createClient();
  const { data: reports, error } = await supabase
    .from("absence_reports")
    .select("*")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .eq("work_date", workDate)
    .order("reported_at", { ascending: false });
  if (error) throw error;
  return attachEmployees(reports ?? []);
}

/** The calling employee's own absence reports, newest first — "My Records" self-service view. */
export async function listMyAbsenceReports(companyId: string, employeeId: string, limit = 30) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("absence_reports")
    .select("*")
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .order("reported_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

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

/** Every daily_attendance_corrections row for (project, work_date) — the audit trail shown alongside a closed day. */
export async function listAbsenceCorrectionsForDate(companyId: string, projectId: string, workDate: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_attendance_corrections")
    .select("*")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .eq("work_date", workDate)
    .order("changed_at", { ascending: false });
  if (error) throw error;
  return attachEmployees(data ?? []);
}

export type AbsenceExportRow = {
  employee: BasicEmployee;
  workDate: string;
  status: string;
  note: string | null;
};

/** Every daily_attendance row across a date range that does NOT permit work — the Absence export's data source (Phase 6). Scoped to the project's roster, one row per (employee, date) that had a recorded unavailable status. */
export async function listAbsencesForDateRange(companyId: string, projectId: string, fromDate: string, toDate: string): Promise<AbsenceExportRow[]> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("daily_attendance")
    .select("employee_id, work_date, status, note")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .gte("work_date", fromDate)
    .lte("work_date", toDate)
    .not("status", "in", "(not_set,present)")
    .order("work_date", { ascending: true });
  if (error) throw error;
  const withEmployees = await attachEmployees(rows ?? []);
  return withEmployees.map((row) => ({ employee: row.employee, workDate: row.work_date, status: row.status, note: row.note }));
}
