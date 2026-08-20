import { createClient } from "@/lib/supabase/server";
import type { AppNotification, WorkedHoursMatrixRow, WorkedHours, WorkedHoursBreakdown, WorkedHoursCorrection, WorkedHoursDiscrepancy, WorkedHoursWithEmployee, WorkedHoursCategoryBreakdown } from "./types";
import { toWorkedHoursCategoryBreakdown } from "./types";
import type { BasicEmployee } from "@/modules/daily-workforce/types";

/**
 * Server-only data access for the Worked Hours domain — see
 * docs/API_CONVENTIONS.md §7. No PostgREST embeds, same reason as every
 * other module this session.
 */

/** Every worked_hours_breakdown row for a set of worked_hours ids, grouped by worked_hours_id — the shared helper every category-aware query below uses to attach a full breakdown to its parent row(s). */
async function listBreakdownByWorkedHoursId(companyId: string, workedHoursIds: string[]): Promise<Map<string, WorkedHoursBreakdown[]>> {
  const map = new Map<string, WorkedHoursBreakdown[]>();
  if (workedHoursIds.length === 0) return map;
  const supabase = await createClient();
  const { data, error } = await supabase.from("worked_hours_breakdown").select("*").eq("company_id", companyId).in("worked_hours_id", workedHoursIds);
  if (error) throw error;
  for (const row of data ?? []) {
    const bucket = map.get(row.worked_hours_id) ?? [];
    bucket.push(row);
    map.set(row.worked_hours_id, bucket);
  }
  return map;
}

/** Every worked_hours row for (project, work_date), resolved with each employee's display name and full category breakdown — the Worked Hours day view's single data source. */
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

  const [{ data: employees, error: employeesError }, breakdownByWorkedHoursId] = await Promise.all([
    supabase.rpc("get_basic_employee_info", { target_employee_ids: [...new Set(rows.map((row) => row.employee_id))] }),
    listBreakdownByWorkedHoursId(companyId, rows.map((row) => row.id)),
  ]);
  if (employeesError) throw employeesError;
  const employeeById = new Map((employees ?? []).map((employee) => [employee.id, employee]));

  return rows
    .map((row) => ({ ...row, employee: employeeById.get(row.employee_id), breakdown: toWorkedHoursCategoryBreakdown(breakdownByWorkedHoursId.get(row.id) ?? []) }))
    .filter((row): row is WorkedHoursWithEmployee => Boolean(row.employee))
    .sort((a, b) => {
      const lastNameCompare = a.employee.last_name.localeCompare(b.employee.last_name);
      return lastNameCompare !== 0 ? lastNameCompare : a.employee.first_name.localeCompare(b.employee.first_name);
    });
}

/** A single employee's worked_hours row for a date, with its full category breakdown — null if none recorded yet. */
export async function getWorkedHours(companyId: string, projectId: string, employeeId: string, workDate: string): Promise<(WorkedHours & { breakdown: WorkedHoursCategoryBreakdown }) | null> {
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
  if (!data) return null;

  const { data: breakdownRows, error: breakdownError } = await supabase.from("worked_hours_breakdown").select("*").eq("company_id", companyId).eq("worked_hours_id", data.id);
  if (breakdownError) throw breakdownError;
  return { ...data, breakdown: toWorkedHoursCategoryBreakdown(breakdownRows ?? []) };
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

/**
 * Item 6: how many correction rows exist per worked_hours row — lets the
 * PM-facing day table/mobile-list show a "Corrected (N)" indicator inline,
 * keyed by worked_hours_id (the caller already has that day's rows from
 * listWorkedHoursForDate, same "batch, don't join" convention as
 * listBreakdownByWorkedHoursId above). Status itself deliberately stays
 * "Submitted" (no second, competing status value is introduced) — this is
 * the "visible correction history" the record surfaces instead.
 */
export async function listWorkedHoursCorrectionCountsByWorkedHoursId(companyId: string, workedHoursIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (workedHoursIds.length === 0) return map;
  const supabase = await createClient();
  const { data, error } = await supabase.from("worked_hours_corrections").select("worked_hours_id").eq("company_id", companyId).in("worked_hours_id", workedHoursIds);
  if (error) throw error;
  for (const row of data ?? []) {
    map.set(row.worked_hours_id, (map.get(row.worked_hours_id) ?? 0) + 1);
  }
  return map;
}

/**
 * Part 45 — the batched (one query total, not N+1) counterpart to
 * listWorkedHoursCorrections() for an entire period at once. My Hours'
 * month view previously called listWorkedHoursCorrections() once PER
 * worked_hours row in the period (up to ~30 separate round-trips for a
 * month) — this replaces that loop with a single `.in()` query, keyed by
 * worked_hours_id, same convention as listWorkedHoursCorrectionCountsByWorkedHoursId above.
 */
export async function listWorkedHoursCorrectionsByWorkedHoursIds(companyId: string, workedHoursIds: string[]): Promise<Map<string, WorkedHoursCorrection[]>> {
  const map = new Map<string, WorkedHoursCorrection[]>();
  if (workedHoursIds.length === 0) return map;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("worked_hours_corrections")
    .select("*")
    .eq("company_id", companyId)
    .in("worked_hours_id", workedHoursIds)
    .order("changed_at", { ascending: true });
  if (error) throw error;
  for (const row of data ?? []) {
    const list = map.get(row.worked_hours_id) ?? [];
    list.push(row);
    map.set(row.worked_hours_id, list);
  }
  return map;
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

/** Every worked_hours row for a project within [fromDate, toDate] inclusive, pivoted into one row per employee with hours keyed by date PLUS a per-category total across the whole period — the Worked Hours "This Month" view's and the Week/Month export's single data source. `employeeIds`, when given, restricts the result to exactly those employees (the "selected workers" export scope) — still always scoped to this one company/project regardless. */
export async function listWorkedHoursForPeriod(companyId: string, projectId: string, fromDate: string, toDate: string, employeeIds?: string[]): Promise<WorkedHoursMatrixRow[]> {
  const supabase = await createClient();
  let query = supabase.from("worked_hours").select("id, employee_id, work_date, hours").eq("company_id", companyId).eq("project_id", projectId).gte("work_date", fromDate).lte("work_date", toDate);
  if (employeeIds) query = query.in("employee_id", employeeIds);
  const { data: rows, error } = await query;
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const [{ data: employees, error: employeesError }, { data: breakdownRows, error: breakdownError }] = await Promise.all([
    supabase.rpc("get_basic_employee_info", { target_employee_ids: [...new Set(rows.map((row) => row.employee_id))] }),
    supabase
      .from("worked_hours_breakdown")
      .select("worked_hours_id, category, hours")
      .eq("company_id", companyId)
      .in(
        "worked_hours_id",
        rows.map((row) => row.id),
      ),
  ]);
  if (employeesError) throw employeesError;
  if (breakdownError) throw breakdownError;
  const employeeById = new Map((employees ?? []).map((employee) => [employee.id, employee]));
  const breakdownByWorkedHoursId = new Map<string, { category: string; hours: number }[]>();
  for (const row of breakdownRows ?? []) {
    const bucket = breakdownByWorkedHoursId.get(row.worked_hours_id) ?? [];
    bucket.push({ category: row.category, hours: Number(row.hours) });
    breakdownByWorkedHoursId.set(row.worked_hours_id, bucket);
  }

  const byEmployeeId = new Map<string, WorkedHoursMatrixRow>();
  for (const row of rows) {
    const employee = employeeById.get(row.employee_id);
    if (!employee) continue;
    const existing = byEmployeeId.get(row.employee_id) ?? { employee, hoursByDate: {}, categoryTotals: toWorkedHoursCategoryBreakdown([]), totalHours: 0 };
    existing.hoursByDate[row.work_date] = Number(row.hours);
    existing.totalHours += Number(row.hours);
    for (const entry of breakdownByWorkedHoursId.get(row.id) ?? []) {
      existing.categoryTotals[entry.category as keyof WorkedHoursCategoryBreakdown] += entry.hours;
    }
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

/**
 * Every distinct date this project has recorded worked hours, newest first
 * — the Worked Hours Archive view's list. Performance fix (operational
 * audit): this previously fetched EVERY worked_hours row in the project's
 * entire history unconditionally, then slice()d to `limit` distinct dates
 * only after loading and aggregating all of it in memory — unbounded
 * growth as a real project accumulates months/years of daily records. A
 * `limit * 3` calendar-day lookback window bounds the query itself (a
 * generous multiplier so gaps — weekends, non-working days — don't starve
 * a project of its full requested archive depth) while still returning
 * the same shape for any real, actively-used project; a long-dormant
 * project's very old history simply won't appear in this recent-archive
 * view, which matches the view's own purpose.
 */
export async function listWorkedHoursArchiveDays(companyId: string, projectId: string, limit = 60): Promise<WorkedHoursArchiveDay[]> {
  const supabase = await createClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - limit * 3);
  const { data: rows, error } = await supabase
    .from("worked_hours")
    .select("work_date, hours, status")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .gte("work_date", cutoff.toISOString().slice(0, 10))
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

/**
 * A newest-first page of a user's own notifications — the Employee
 * Dashboard's "Notifications / actions required" section, and the full
 * Notification Center page. Always scoped to `recipient_user_id =
 * auth.uid()` by RLS, never client-filterable to another user.
 *
 * Task 3 Part 9: strictly `created_at DESC`, global chronological order —
 * previously ordered unread-first (`read_at` ascending nulls-first, THEN
 * created_at), which could surface a weeks-old unread notification above a
 * genuinely newer read one. Read/unread is now distinguished purely by
 * NotificationList's own styling (dimmed + no "Mark read" button once
 * read_at is set), never by sort position.
 */
export async function listMyNotifications(limit = 20): Promise<AppNotification[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(limit);
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
export async function listWorkedHoursHistoryForEmployee(companyId: string, projectId: string, employeeId: string, fromDate: string, toDate: string): Promise<WorkedHoursWithEmployee[]> {
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
  if (!data || data.length === 0) return [];

  const [{ data: employees, error: employeesError }, breakdownByWorkedHoursId] = await Promise.all([
    supabase.rpc("get_basic_employee_info", { target_employee_ids: [employeeId] }),
    listBreakdownByWorkedHoursId(companyId, data.map((row) => row.id)),
  ]);
  if (employeesError) throw employeesError;
  const employee = employees?.[0];
  if (!employee) return [];

  return data.map((row) => ({ ...row, employee, breakdown: toWorkedHoursCategoryBreakdown(breakdownByWorkedHoursId.get(row.id) ?? []) }));
}
