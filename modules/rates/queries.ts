import { createClient } from "@/lib/supabase/server";
import { resolveDeciderNames } from "@/modules/leave-requests/queries";
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
