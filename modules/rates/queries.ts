import { createClient } from "@/lib/supabase/server";
import { resolveDeciderNames } from "@/modules/leave-requests/queries";
import { listActiveEmployeesForPicker } from "@/modules/employees/queries";
import type { EmployeeHourlyRate, RateHistoryEntry } from "./types";

/** Current + historical rate rows for one employee, newest effective_from first. Empty when no rate has ever been set (never fabricated). */
export async function listEmployeeRateHistory(companyId: string, employeeId: string): Promise<RateHistoryEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_hourly_rates")
    .select("*")
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .order("effective_from", { ascending: false });
  if (error) throw error;
  const rows: EmployeeHourlyRate[] = data ?? [];

  const changedByIds = rows.map((row) => row.changed_by).filter((id): id is string => Boolean(id));
  const namesByUserId = await resolveDeciderNames(companyId, changedByIds);

  return rows.map((row) => ({
    id: row.id,
    hourlyRate: Number(row.hourly_rate),
    currency: row.currency,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    reason: row.reason,
    changedByName: row.changed_by ? (namesByUserId.get(row.changed_by) ?? null) : null,
  }));
}

/** The single open (effective_to IS NULL) rate row, or null if none has ever been set. */
export async function getCurrentEmployeeRate(companyId: string, employeeId: string): Promise<RateHistoryEntry | null> {
  const history = await listEmployeeRateHistory(companyId, employeeId);
  return history.find((entry) => entry.effectiveTo === null) ?? null;
}

/**
 * Part 13/17/34 — the rate periods that could possibly apply to any date
 * in [fromDate, toDate], in ONE bounded query (never one query per
 * worked_hours row). The caller resolves the exact per-date rate by
 * finding the row whose [effective_from, effective_to] window contains
 * that date — see resolveRateForDate() below.
 */
export async function listEmployeeRatePeriodsOverlapping(companyId: string, employeeId: string, fromDate: string, toDate: string): Promise<EmployeeHourlyRate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_hourly_rates")
    .select("*")
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .lte("effective_from", toDate)
    .or(`effective_to.is.null,effective_to.gte.${fromDate}`);
  if (error) throw error;
  return data ?? [];
}

/** Pure resolution — never a network call — so it can be reused identically by the day-detail UI and the batched monthly calculation without re-fetching. */
export function resolveRateForDate(periods: EmployeeHourlyRate[], workDate: string): EmployeeHourlyRate | null {
  return periods.find((p) => p.effective_from <= workDate && (p.effective_to === null || p.effective_to >= workDate)) ?? null;
}

/**
 * Part 16/34 — one batched query for MULTIPLE employees' rate effective
 * ON one specific date (the management labor-cost estimate's data
 * source) — never one query per employee per hour row.
 */
export type EmployeeWithCurrentRate = {
  id: string;
  firstName: string;
  lastName: string;
  positionTitle: string | null;
  currentRate: RateHistoryEntry | null;
};

/**
 * Part 18 — the "Employee Rates" section's data source: every active
 * employee in the company, paired with their current (effective_to IS
 * NULL) rate, or null if none has ever been set. One bounded query for
 * the employee roster plus one bounded query for every currently-open
 * rate row — never one query per employee (Part 34).
 */
export async function listEmployeesWithCurrentRate(companyId: string): Promise<EmployeeWithCurrentRate[]> {
  const supabase = await createClient();
  const [employees, { data: currentRateRows, error }] = await Promise.all([
    listActiveEmployeesForPicker(companyId),
    supabase.from("employee_hourly_rates").select("*").eq("company_id", companyId).is("effective_to", null),
  ]);
  if (error) throw error;

  const changedByIds = (currentRateRows ?? []).map((row) => row.changed_by).filter((id): id is string => Boolean(id));
  const namesByUserId = await resolveDeciderNames(companyId, changedByIds);
  const rateByEmployeeId = new Map(
    (currentRateRows ?? []).map((row) => [
      row.employee_id,
      {
        id: row.id,
        hourlyRate: Number(row.hourly_rate),
        currency: row.currency,
        effectiveFrom: row.effective_from,
        effectiveTo: row.effective_to,
        reason: row.reason,
        changedByName: row.changed_by ? (namesByUserId.get(row.changed_by) ?? null) : null,
      } satisfies RateHistoryEntry,
    ]),
  );

  return employees.map((employee) => ({
    id: employee.id,
    firstName: employee.first_name,
    lastName: employee.last_name,
    positionTitle: employee.position_title,
    currentRate: rateByEmployeeId.get(employee.id) ?? null,
  }));
}

export async function listEffectiveRatesForEmployeesOnDate(companyId: string, employeeIds: string[], workDate: string): Promise<Map<string, EmployeeHourlyRate>> {
  const map = new Map<string, EmployeeHourlyRate>();
  if (employeeIds.length === 0) return map;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_hourly_rates")
    .select("*")
    .eq("company_id", companyId)
    .in("employee_id", employeeIds)
    .lte("effective_from", workDate)
    .or(`effective_to.is.null,effective_to.gte.${workDate}`);
  if (error) throw error;
  for (const row of data ?? []) {
    const existing = map.get(row.employee_id);
    if (!existing || row.effective_from > existing.effective_from) map.set(row.employee_id, row);
  }
  return map;
}
