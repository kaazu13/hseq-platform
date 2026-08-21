import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployeeRate, listEmployeeRatePeriodsOverlapping, resolveRateForDate } from "./queries";
import { listWorkedHoursHistoryForEmployee } from "@/modules/worked-hours/queries";
import { getEffectivePayRulesForDateRange, resolveEffectivePayRules } from "@/modules/pay-rules/queries";
import { calculateEstimatedEarnings, sumEstimatedEarnings, isSundayDate } from "@/modules/pay-rules/earnings";
import type { RateHistoryEntry } from "./types";

export type MyRateCardData = {
  current: RateHistoryEntry | null;
  estimatedThisMonth: number;
  currency: string;
};

/**
 * Part 4 — one bounded call for the Dashboard's "My Rate" card: current
 * rate + an estimate of this month's earnings so far, reusing the SAME
 * earnings engine My Hours uses (never a second calculation). Batched:
 * one worked_hours query, one rate-periods query, one pay-rules query —
 * never per-day round trips.
 */
export async function getMyRateCardData(companyId: string, employeeId: string, monthFromDate: string, monthToDate: string): Promise<MyRateCardData> {
  const current = await getCurrentEmployeeRate(companyId, employeeId);
  if (!current) {
    return { current: null, estimatedThisMonth: 0, currency: "EUR" };
  }

  const supabase = await createClient();
  const { data: projectRows } = await supabase.from("project_assignments").select("project_id").eq("company_id", companyId).eq("employee_id", employeeId).is("end_at", null).limit(1);
  const projectId = projectRows?.[0]?.project_id;
  if (!projectId) {
    return { current, estimatedThisMonth: 0, currency: current.currency };
  }

  const [rows, ratePeriods, payRules] = await Promise.all([
    listWorkedHoursHistoryForEmployee(companyId, projectId, employeeId, monthFromDate, monthToDate),
    listEmployeeRatePeriodsOverlapping(companyId, employeeId, monthFromDate, monthToDate),
    getEffectivePayRulesForDateRange(companyId, monthFromDate, monthToDate),
  ]);

  const dailyEstimates = rows
    .map((row) => {
      // A day before any rate period ever existed contributes nothing to
      // the estimate rather than wrongly borrowing the current rate.
      const rateForDay = resolveRateForDate(ratePeriods, row.work_date);
      if (!rateForDay) return null;
      const rulesForDay = resolveEffectivePayRules(payRules, row.work_date);
      return calculateEstimatedEarnings({
        hourlyRate: Number(rateForDay.hourly_rate),
        currency: rateForDay.currency,
        breakdown: row.breakdown,
        isSunday: isSundayDate(row.work_date),
        rulesByCategory: rulesForDay,
      });
    })
    .filter((estimate) => estimate !== null);

  const summed = sumEstimatedEarnings(dailyEstimates.length > 0 ? dailyEstimates : [{ currency: current.currency, lineItems: [], basePayTotal: 0, categoryPremiumTotal: 0, sundayPremiumTotal: 0, total: 0 }]);
  return { current, estimatedThisMonth: summed.total, currency: current.currency };
}
