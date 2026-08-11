import type { WorkedHours, WorkedHoursCorrection, WorkedHoursDiscrepancy } from "@/modules/worked-hours/types";
import { WORKED_HOURS_DISCREPANCY_STATUS_LABELS } from "@/modules/worked-hours/types";
import { ReportDiscrepancyButton } from "@/modules/worked-hours/components/report-discrepancy-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type MyHoursRowProps = {
  companyId: string;
  workedHours: WorkedHours;
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
 * One day's worked-hours row on the employee's own "My Hours" page (Phase
 * 2) — read-only (no edit control anywhere here; employees never alter
 * submitted hours directly, only report a discrepancy for review). Shows
 * the row's correction history (if any) and current discrepancy status
 * (if one was ever reported), then offers "Report discrepancy" unless one
 * is already open for this exact row.
 */
export function MyHoursRow({ companyId, workedHours, corrections, discrepancy }: MyHoursRowProps) {
  const hasOpenDiscrepancy = discrepancy?.status === "open";

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">{formatWorkDate(workedHours.work_date)}</span>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">{workedHours.hours}h</span>
            <Badge variant={workedHours.status === "submitted" ? "default" : "secondary"}>{workedHours.status === "submitted" ? "Submitted" : "Draft"}</Badge>
          </div>
        </div>

        {workedHours.note && <p className="text-sm text-muted-foreground">{workedHours.note}</p>}

        {corrections.length > 0 && (
          <div className="flex flex-col gap-1 border-t pt-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Correction history</span>
            {corrections.map((correction) => (
              <p key={correction.id} className="text-xs text-muted-foreground">
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
