import { CalendarClock } from "lucide-react";
import type { EmploymentPeriod } from "@/modules/employees/types";
import { EMPLOYMENT_END_REASON_LABELS } from "@/modules/employees/types";
import { EndEmploymentDialog } from "@/modules/employees/components/end-employment-dialog";
import { RehireEmployeeDialog } from "@/modules/employees/components/rehire-employee-dialog";
import { EmptyState } from "@/components/shared/empty-state";

type EmploymentHistoryTabProps = {
  companyId: string;
  employeeId: string;
  employeeName: string;
  periods: EmploymentPeriod[];
  canManage: boolean;
};

function formatDate(value: string | null): string {
  if (!value) return "Present";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Read-only employment-period timeline plus the two mutating actions
 * (End employment / Rehire) — Employment Lifecycle milestone. Periods are
 * never edited or removed from this tab; the only two things a manager can
 * do are close the current open period or open a new one, both via a
 * dedicated dialog that writes to `employee_employment_periods`
 * (supabase/migrations/20260727090000_employment_periods.sql), never to
 * `employees` directly — see that migration's header for why.
 */
export function EmploymentHistoryTab({ companyId, employeeId, employeeName, periods, canManage }: EmploymentHistoryTabProps) {
  const openPeriod = periods.find((period) => period.end_date === null) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex justify-start">
          {openPeriod ? (
            <EndEmploymentDialog companyId={companyId} employeeId={employeeId} employeeName={employeeName} />
          ) : (
            <RehireEmployeeDialog companyId={companyId} employeeId={employeeId} employeeName={employeeName} />
          )}
        </div>
      )}

      {periods.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No employment history yet" description="This employee has no recorded employment period." />
      ) : (
        <div className="flex flex-col gap-3">
          {periods.map((period) => (
            <div key={period.id} className="flex flex-col gap-2 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {formatDate(period.start_date)} – {formatDate(period.end_date)}
                </span>
                {period.end_date === null && (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                    Current
                  </span>
                )}
              </div>
              {period.end_reason && (
                <p className="text-sm text-muted-foreground">
                  Ended — {EMPLOYMENT_END_REASON_LABELS[period.end_reason]}
                  {period.end_note ? `: ${period.end_note}` : ""}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
