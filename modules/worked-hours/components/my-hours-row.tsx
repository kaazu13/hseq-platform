import type { WorkedHoursWithEmployee, WorkedHoursCorrection, WorkedHoursDiscrepancy } from "@/modules/worked-hours/types";
import { WORKED_HOURS_DISCREPANCY_STATUS_LABELS, WORKED_HOURS_CATEGORIES, WORKED_HOURS_CATEGORY_LABELS } from "@/modules/worked-hours/types";
import { ReportDiscrepancyButton } from "@/modules/worked-hours/components/report-discrepancy-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type MyHoursRowProps = {
  companyId: string;
  workedHours: WorkedHoursWithEmployee;
  corrections: WorkedHoursCorrection[];
  discrepancy: WorkedHoursDiscrepancy | null;
};

function formatWorkDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function formatChangedAt(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * One day's worked-hours row on the employee's own "My Hours" page
 * (Worked Hours V2, Phase 2) — read-only (no edit control anywhere here;
 * employees never alter submitted hours directly, only report a
 * discrepancy for review). Shows the real category breakdown (Phase 2's
 * explicit "10 Aug 2026 / Regular 10.0h / Overtime 0.0h / ... / Total
 * 10.0h" example), the row's correction history (each now tagged with
 * which category changed), and current discrepancy status, then offers
 * "Report discrepancy" unless one is already open for this exact row.
 */
export function MyHoursRow({ companyId, workedHours, corrections, discrepancy }: MyHoursRowProps) {
  const hasOpenDiscrepancy = discrepancy?.status === "open";

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">{formatWorkDate(workedHours.work_date)}</span>
          <Badge variant={workedHours.status === "submitted" ? "default" : "secondary"}>{workedHours.status === "submitted" ? "Submitted" : "Draft"}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {WORKED_HOURS_CATEGORIES.map((category) => (
            <div key={category} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{WORKED_HOURS_CATEGORY_LABELS[category]}</span>
              <span className="tabular-nums">{workedHours.breakdown[category].toFixed(1)} h</span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t pt-1.5">
          <span className="text-sm font-semibold">Total</span>
          <span className="text-lg font-semibold tabular-nums">{workedHours.hours} h</span>
        </div>

        {workedHours.note && <p className="text-sm text-muted-foreground">{workedHours.note}</p>}

        {corrections.length > 0 && (
          <div className="flex flex-col gap-1 border-t pt-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Correction history</span>
            {corrections.map((correction) => (
              <p key={correction.id} className="text-xs text-muted-foreground">
                {correction.category ? `${WORKED_HOURS_CATEGORY_LABELS[correction.category]}: ` : ""}
                {correction.previous_hours}h → {correction.new_hours}h — {correction.reason} ({formatChangedAt(correction.changed_at)})
              </p>
            ))}
          </div>
        )}

        {discrepancy && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-2">
            <Badge variant="secondary">{WORKED_HOURS_DISCREPANCY_STATUS_LABELS[discrepancy.status]}</Badge>
            <span className="text-xs text-muted-foreground">{discrepancy.comment}</span>
          </div>
        )}

        {!hasOpenDiscrepancy && (
          <div className="pt-1">
            <ReportDiscrepancyButton companyId={companyId} workedHoursId={workedHours.id} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
