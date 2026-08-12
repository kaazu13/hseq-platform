"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { WorkedHoursWithEmployee, WorkedHoursCorrection, WorkedHoursDiscrepancy } from "@/modules/worked-hours/types";
import { WORKED_HOURS_DISCREPANCY_STATUS_LABELS, WORKED_HOURS_CATEGORIES, WORKED_HOURS_CATEGORY_LABELS, WORKED_HOURS_CATEGORY_SHORT_LABELS } from "@/modules/worked-hours/types";
import { ReportDiscrepancyButton } from "@/modules/worked-hours/components/report-discrepancy-button";
import { Badge } from "@/components/ui/badge";

type MyHoursRowProps = {
  companyId: string;
  workedHours: WorkedHoursWithEmployee;
  corrections: WorkedHoursCorrection[];
  discrepancy: WorkedHoursDiscrepancy | null;
};

function formatWorkDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function formatChangedAt(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * One day's worked-hours row on the employee's own "My Hours" page. Items
 * 7/8: a single compact, scannable line — "Wed, Aug 12   Regular 10.0h
 * · Overtime 2.0h   Total 12.0h   Submitted" — showing only categories
 * whose value is actually greater than zero (never four "0.0h" rows for a
 * simple single-category day), never a large card by default. Tap/click to
 * expand the same detail this used to show unconditionally: note,
 * correction history, discrepancy status, and "Report discrepancy" (read-
 * only otherwise — employees never alter submitted hours directly here).
 */
export function MyHoursRow({ companyId, workedHours, corrections, discrepancy }: MyHoursRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasOpenDiscrepancy = discrepancy?.status === "open";
  const nonZeroCategories = WORKED_HOURS_CATEGORIES.filter((category) => workedHours.breakdown[category] > 0);

  return (
    <div className="flex flex-col rounded-lg border">
      <button type="button" onClick={() => setExpanded((prev) => !prev)} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 p-3 text-left">
        <div className="flex min-w-0 items-center gap-2">
          {expanded ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
          <span className="shrink-0 text-sm font-medium">{formatWorkDate(workedHours.work_date)}</span>
          {nonZeroCategories.length > 0 && (
            <span className="min-w-0 truncate text-sm text-muted-foreground">
              {nonZeroCategories.map((category) => `${WORKED_HOURS_CATEGORY_SHORT_LABELS[category]} ${workedHours.breakdown[category].toFixed(1)}h`).join(" · ")}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-semibold tabular-nums">Total {workedHours.hours}h</span>
          <Badge variant={workedHours.status === "submitted" ? "default" : "secondary"}>{workedHours.status === "submitted" ? "Submitted" : "Draft"}</Badge>
          {corrections.length > 0 && (
            <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
              Corrected
            </Badge>
          )}
          {hasOpenDiscrepancy && <Badge variant="secondary">{WORKED_HOURS_DISCREPANCY_STATUS_LABELS.open}</Badge>}
        </div>
      </button>

      {expanded && (
        <div className="flex flex-col gap-2 border-t bg-muted/20 p-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            {(nonZeroCategories.length > 0 ? nonZeroCategories : WORKED_HOURS_CATEGORIES).map((category) => (
              <div key={category} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">{WORKED_HOURS_CATEGORY_LABELS[category]}</span>
                <span className="tabular-nums">{workedHours.breakdown[category].toFixed(1)} h</span>
              </div>
            ))}
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
        </div>
      )}
    </div>
  );
}
