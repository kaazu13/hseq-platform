"use client";

import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { WORKED_HOURS_CATEGORIES, WORKED_HOURS_CATEGORY_LABELS, sumWorkedHoursCategoryBreakdown, type WorkedHoursCategoryBreakdown } from "@/modules/worked-hours/types";
import { DAILY_ATTENDANCE_STATUS_LABELS, type DailyAttendanceStatus } from "@/modules/daily-workforce/types";

export type MonthDayCell = {
  date: string;
  isCurrentMonth: boolean;
  isSunday: boolean;
  hoursTotal: number;
  breakdown: WorkedHoursCategoryBreakdown | null;
  attendanceStatus: DailyAttendanceStatus;
  hasPendingRequest: boolean;
  hasApprovedLeave: boolean;
  hasConfirmedAbsence: boolean;
  discrepancyStatus: string | null;
  correctionCount: number;
  /** Part 15 — the day's estimated pay breakdown, when a rate was effective that date. Null means "no rate known for this day" (never shown as €0). */
  dayEarnings: { hourlyRate: number; currency: string; basePayTotal: number; categoryPremiumTotal: number; sundayPremiumTotal: number; total: number } | null;
};

type DayState = "worked" | "approvedLeave" | "confirmedAbsent" | "pending" | "sunday" | "normal";

/** Part 20/38's deterministic precedence: worked hours (if any) generally wins visually, EXCEPT it's flagged as a CONFLICT (not silently hidden) when contradictory approved-leave/confirmed-absence data exists for the same day — never zero hours just because a request was submitted. */
export function resolveDayState(cell: MonthDayCell): { state: DayState; conflict: boolean } {
  const worked = cell.hoursTotal > 0;
  const confirmedUnavailable = cell.hasApprovedLeave || cell.hasConfirmedAbsence;
  if (worked && confirmedUnavailable) return { state: "worked", conflict: true };
  if (worked) return { state: "worked", conflict: false };
  if (cell.hasApprovedLeave) return { state: "approvedLeave", conflict: false };
  if (cell.hasConfirmedAbsence) return { state: "confirmedAbsent", conflict: false };
  if (cell.hasPendingRequest) return { state: "pending", conflict: false };
  if (cell.isSunday) return { state: "sunday", conflict: false };
  return { state: "normal", conflict: false };
}

const STATE_CLASSES: Record<DayState, string> = {
  worked: "bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30",
  approvedLeave: "bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30",
  confirmedAbsent: "bg-rose-50 border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/30",
  pending: "bg-yellow-50 border-yellow-200 dark:bg-yellow-500/10 dark:border-yellow-500/30",
  sunday: "bg-muted/40 border-transparent",
  normal: "bg-background border-border",
};

export function MyHoursMonthCalendar({ cells }: { cells: MonthDayCell[] }) {
  const t = useTranslations("MyHours");
  const format = useFormatter();
  const [selected, setSelected] = useState<MonthDayCell | null>(null);

  const weekdayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
        {weekdayKeys.map((key) => (
          <span key={key}>{t(`weekday.${key}`)}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const { state, conflict } = resolveDayState(cell);
          const dayNumber = Number(cell.date.slice(8, 10));
          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => setSelected(cell)}
              className={cn(
                "flex min-h-14 flex-col items-start gap-0.5 rounded-md border p-1.5 text-left transition-colors hover:border-primary/50 sm:min-h-20 sm:p-2",
                STATE_CLASSES[state],
                !cell.isCurrentMonth && "opacity-40",
              )}
            >
              <span className="flex w-full items-center justify-between text-xs font-medium">
                {dayNumber}
                {conflict && <AlertTriangle className="size-3 text-amber-600 dark:text-amber-400" aria-label={t("conflictBadge")} />}
              </span>
              {cell.hoursTotal > 0 && <span className="text-xs font-semibold tabular-nums sm:text-sm">{cell.hoursTotal.toFixed(1)}h</span>}
              {state === "pending" && <span className="hidden text-[10px] text-muted-foreground sm:inline">{t("pendingBadge")}</span>}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
        <LegendSwatch className={STATE_CLASSES.worked} label={t("legend.worked")} />
        <LegendSwatch className={STATE_CLASSES.approvedLeave} label={t("legend.approvedLeave")} />
        <LegendSwatch className={STATE_CLASSES.confirmedAbsent} label={t("legend.confirmedAbsent")} />
        <LegendSwatch className={STATE_CLASSES.pending} label={t("legend.pending")} />
        <LegendSwatch className={STATE_CLASSES.sunday} label={t("legend.sunday")} />
      </div>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-sm">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.date}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-2 text-sm">
                {selected.breakdown ? (
                  <>
                    {WORKED_HOURS_CATEGORIES.map((category) => (
                      <div key={category} className="flex items-center justify-between">
                        <span className="text-muted-foreground">{WORKED_HOURS_CATEGORY_LABELS[category]}</span>
                        <span className="font-medium tabular-nums">{selected.breakdown![category].toFixed(1)}h</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between border-t pt-2 font-semibold">
                      <span>{t("total")}</span>
                      <span className="tabular-nums">{sumWorkedHoursCategoryBreakdown(selected.breakdown).toFixed(1)}h</span>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">{t("noHoursThisDay")}</p>
                )}
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="text-muted-foreground">{t("attendance")}</span>
                  <Badge variant="secondary">{DAILY_ATTENDANCE_STATUS_LABELS[selected.attendanceStatus]}</Badge>
                </div>
                {selected.discrepancyStatus && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t("discrepancy")}</span>
                    <Badge variant="outline">{selected.discrepancyStatus}</Badge>
                  </div>
                )}
                {selected.correctionCount > 0 && <p className="text-xs text-muted-foreground">{t("correctionCount", { count: selected.correctionCount })}</p>}
                {selected.dayEarnings && (
                  <div className="flex flex-col gap-1 border-t pt-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{t("rate")}</span>
                      <span>{format.number(selected.dayEarnings.hourlyRate, { style: "currency", currency: selected.dayEarnings.currency })}/h</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t("basePay")}</span>
                      <span className="tabular-nums">{format.number(selected.dayEarnings.basePayTotal, { style: "currency", currency: selected.dayEarnings.currency })}</span>
                    </div>
                    {selected.dayEarnings.categoryPremiumTotal > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{t("premiums")}</span>
                        <span className="tabular-nums">{format.number(selected.dayEarnings.categoryPremiumTotal, { style: "currency", currency: selected.dayEarnings.currency })}</span>
                      </div>
                    )}
                    {selected.dayEarnings.sundayPremiumTotal > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{t("sundayPremium")}</span>
                        <span className="tabular-nums">{format.number(selected.dayEarnings.sundayPremiumTotal, { style: "currency", currency: selected.dayEarnings.currency })}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between font-semibold">
                      <span>{t("estimatedDayTotal")}</span>
                      <span className="tabular-nums">{format.number(selected.dayEarnings.total, { style: "currency", currency: selected.dayEarnings.currency })}</span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-sm border", className)} />
      {label}
    </span>
  );
}
