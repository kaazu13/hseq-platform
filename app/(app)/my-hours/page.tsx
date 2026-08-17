import Link from "next/link";
import { Clock, UserX } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { resolveCurrentProject } from "@/modules/projects/queries";
import { getMyEmployeeId, listMyAttendanceForPeriod } from "@/modules/daily-workforce/queries";
import { dailyAttendancePermitsWork, DAILY_ATTENDANCE_STATUS_LABELS } from "@/modules/daily-workforce/types";
import { listWorkedHoursHistoryForEmployee, listMyWorkedHoursDiscrepancies, listWorkedHoursCorrections } from "@/modules/worked-hours/queries";
import { listMyAbsenceReports } from "@/modules/absences/queries";
import { ABSENCE_REPORT_STATUS_LABELS } from "@/modules/absences/types";
import { listMyAttendanceReviewRequests } from "@/modules/attendance-review/queries";
import { ATTENDANCE_REVIEW_STATUS_LABELS } from "@/modules/attendance-review/types";
import { RequestReviewButton } from "@/modules/attendance-review/components/request-review-button";
import { resolveWorkedHoursPeriod, formatWorkedHoursPeriodLabel, countDaysWorked, type WorkedHoursPeriodMode } from "@/modules/worked-hours/period";
import { WORKED_HOURS_CATEGORIES, WORKED_HOURS_CATEGORY_LABELS, toWorkedHoursCategoryBreakdown, sumWorkedHoursCategoryBreakdown } from "@/modules/worked-hours/types";
import { MyHoursRow } from "@/modules/worked-hours/components/my-hours-row";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type MyHoursPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(date: string, mode: WorkedHoursPeriodMode, direction: 1 | -1): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (mode === "day") d.setUTCDate(d.getUTCDate() + direction);
  else if (mode === "week") d.setUTCDate(d.getUTCDate() + direction * 7);
  else d.setUTCMonth(d.getUTCMonth() + direction);
  return d.toISOString().slice(0, 10);
}

/**
 * "My Hours" (Phase 2) — the employee's own read-only worked-hours history:
 * Day/Week/Month periods, previous-period navigation, correction history,
 * and discrepancy status/reporting per day. No edit control exists
 * anywhere on this page — upsert_worked_hours() is never called from here,
 * only report_worked_hours_discrepancy() via MyHoursRow's
 * ReportDiscrepancyButton. Scoped to the caller's own employee record in
 * their current company/project, same resolution as the Employee
 * Dashboard section this page is linked from.
 */
export default async function MyHoursPage({ searchParams }: MyHoursPageProps) {
  const params = await searchParams;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="My Hours" />
        <EmptyState icon={Clock} title="No company yet" description="Once you're part of a company, your worked hours will appear here." className="flex-1" />
      </div>
    );
  }

  const { currentProjectId } = await resolveCurrentProject(user.id, currentCompanyId);
  if (!currentProjectId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="My Hours" />
        <EmptyState icon={Clock} title="No active project" description="Choose a project from the dashboard first." className="flex-1" />
      </div>
    );
  }

  const myEmployeeId = await getMyEmployeeId(currentCompanyId, user.id);
  if (!myEmployeeId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="My Hours" />
        <EmptyState icon={Clock} title="No linked employee record" description="Your account isn't linked to an employee record in this company yet." className="flex-1" />
      </div>
    );
  }

  const activeTab: "hours" | "absences" = params.tab === "absences" ? "absences" : "hours";
  const mode: WorkedHoursPeriodMode = params.view === "week" ? "week" : params.view === "month" ? "month" : "day";
  const anchorDate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : todayIsoDate();
  const period = resolveWorkedHoursPeriod(mode, anchorDate);

  if (activeTab === "absences") {
    return (
      <MyAbsencesTab
        companyId={currentCompanyId}
        projectId={currentProjectId}
        myEmployeeId={myEmployeeId}
        mode={mode}
        anchorDate={anchorDate}
        period={period}
      />
    );
  }

  const [rows, discrepancies] = await Promise.all([
    listWorkedHoursHistoryForEmployee(currentCompanyId, currentProjectId, myEmployeeId, period.fromDate, period.toDate),
    listMyWorkedHoursDiscrepancies(currentCompanyId, myEmployeeId),
  ]);

  const correctionsByWorkedHoursId = new Map(
    await Promise.all(rows.map(async (row) => [row.id, await listWorkedHoursCorrections(currentCompanyId, row.id)] as const)),
  );
  const discrepancyByWorkedHoursId = new Map(discrepancies.map((discrepancy) => [discrepancy.worked_hours_id, discrepancy]));

  const totalHours = rows.reduce((sum, row) => sum + Number(row.hours), 0);
  const periodCategoryTotals = toWorkedHoursCategoryBreakdown([]);
  const hoursByDate: Record<string, number> = {};
  for (const row of rows) {
    for (const category of WORKED_HOURS_CATEGORIES) periodCategoryTotals[category] += row.breakdown[category];
    hoursByDate[row.work_date] = (hoursByDate[row.work_date] ?? 0) + Number(row.hours);
  }
  const daysWorked = countDaysWorked(hoursByDate);
  const basePath = "/my-hours";
  const prevDate = shiftDate(anchorDate, mode, -1);
  const nextDate = shiftDate(anchorDate, mode, 1);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="My Hours" description={`${formatWorkedHoursPeriodLabel(period)} · ${totalHours.toFixed(1)}h total`} />

      <MyHoursTabSwitcher active="hours" mode={mode} anchorDate={anchorDate} />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={`${basePath}?view=day`} className={mode === "day" ? "font-medium" : "text-muted-foreground transition-colors hover:text-foreground"}>
          Day
        </Link>
        <span className="text-muted-foreground">/</span>
        <Link href={`${basePath}?view=week`} className={mode === "week" ? "font-medium" : "text-muted-foreground transition-colors hover:text-foreground"}>
          Week
        </Link>
        <span className="text-muted-foreground">/</span>
        <Link href={`${basePath}?view=month`} className={mode === "month" ? "font-medium" : "text-muted-foreground transition-colors hover:text-foreground"}>
          Month
        </Link>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <Link href={`${basePath}?view=${mode}&date=${prevDate}`} className="text-muted-foreground transition-colors hover:text-foreground">
          ← Previous
        </Link>
        <Link href={basePath} className="text-muted-foreground transition-colors hover:text-foreground">
          Today
        </Link>
        <Link href={`${basePath}?view=${mode}&date=${nextDate}`} className="text-muted-foreground transition-colors hover:text-foreground">
          Next →
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Clock} title="No hours recorded" description="Nothing has been recorded for this period yet." className="flex-1" />
      ) : (
        <div className="flex flex-col gap-4">
          {mode !== "day" && (
            <Card>
              <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-4 text-sm">
                {/* Item 7: only categories with real hours are shown — never a wall of "0.0h" rows. */}
                {WORKED_HOURS_CATEGORIES.filter((category) => periodCategoryTotals[category] > 0).map((category) => (
                  <span key={category} className="text-muted-foreground">
                    {WORKED_HOURS_CATEGORY_LABELS[category]} <span className="font-medium text-foreground tabular-nums">{periodCategoryTotals[category].toFixed(1)}h</span>
                  </span>
                ))}
                <span className="text-muted-foreground">
                  Days worked <span className="font-medium text-foreground tabular-nums">{daysWorked}</span>
                </span>
                <span className="ml-auto font-semibold">
                  Grand Total <span className="text-lg tabular-nums">{sumWorkedHoursCategoryBreakdown(periodCategoryTotals).toFixed(1)}h</span>
                </span>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-col gap-2">
            {rows.map((row) => (
              <MyHoursRow key={row.id} companyId={currentCompanyId} workedHours={row} corrections={correctionsByWorkedHoursId.get(row.id) ?? []} discrepancy={discrepancyByWorkedHoursId.get(row.id) ?? null} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Hours / Absences — the top-level tab switcher shared by both views, preserving the current Day/Week/Month granularity and anchor date across the switch. */
function MyHoursTabSwitcher({ active, mode, anchorDate }: { active: "hours" | "absences"; mode: WorkedHoursPeriodMode; anchorDate: string }) {
  const suffix = `view=${mode}&date=${anchorDate}`;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
      <Link href={`/my-hours?${suffix}`} className={active === "hours" ? "text-foreground" : "text-muted-foreground transition-colors hover:text-foreground"}>
        Hours
      </Link>
      <span className="text-muted-foreground">/</span>
      <Link href={`/my-hours?tab=absences&${suffix}`} className={active === "absences" ? "text-foreground" : "text-muted-foreground transition-colors hover:text-foreground"}>
        Absences
      </Link>
    </div>
  );
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Task 3 Part 18 — My Hours' new "Absences" tab. Own records only
 * (listMyAttendanceForPeriod/listMyAbsenceReports are both RLS-scoped to
 * the caller's own employee row), shown here purely from REAL rows — never
 * inferred from a day with no worked_hours entry. Week mode assumes a
 * Monday-Saturday workweek (unlike Hours' own Monday-Sunday week, which
 * exists for complete payroll-period reporting) — Sunday is never treated
 * as an expected work day for absence purposes, so the query range is
 * clipped to Saturday rather than reusing the Hours tab's full 7-day week.
 */
async function MyAbsencesTab({
  companyId,
  projectId,
  myEmployeeId,
  mode,
  anchorDate,
  period,
}: {
  companyId: string;
  projectId: string;
  myEmployeeId: string;
  mode: WorkedHoursPeriodMode;
  anchorDate: string;
  period: ReturnType<typeof resolveWorkedHoursPeriod>;
}) {
  const absenceToDate = mode === "week" ? addDays(period.fromDate, 5) : period.toDate;

  const [attendanceRows, absenceReports, reviewRequests] = await Promise.all([
    listMyAttendanceForPeriod(companyId, myEmployeeId, period.fromDate, absenceToDate),
    listMyAbsenceReports(companyId, myEmployeeId),
    listMyAttendanceReviewRequests(companyId, myEmployeeId),
  ]);

  const genuineAbsences = attendanceRows.filter((row) => !dailyAttendancePermitsWork(row.status));
  const reportsInRange = absenceReports.filter((report) => report.work_date >= period.fromDate && report.work_date <= absenceToDate);
  const reportByDate = new Map(reportsInRange.map((report) => [report.work_date, report]));
  // Task 3 Part 19 — a day with an unresolved (pending) review request
  // never shows a second "Request review" button; an already-decided one
  // (accepted/rejected) can be contested again with new information.
  const pendingReviewDates = new Set(reviewRequests.filter((request) => request.status === "pending").map((request) => request.work_date));
  const latestReviewByDate = new Map<string, (typeof reviewRequests)[number]>();
  for (const request of reviewRequests) {
    if (!latestReviewByDate.has(request.work_date)) latestReviewByDate.set(request.work_date, request);
  }

  const basePath = "/my-hours";
  const prevDate = shiftDate(anchorDate, mode, -1);
  const nextDate = shiftDate(anchorDate, mode, 1);
  const periodLabel = mode === "week" ? `${formatDisplayDate(period.fromDate)} – ${formatDisplayDate(absenceToDate)}` : formatWorkedHoursPeriodLabel(period);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="My Hours" description={`${periodLabel} · ${genuineAbsences.length} ${genuineAbsences.length === 1 ? "day" : "days"} recorded`} />

      <MyHoursTabSwitcher active="absences" mode={mode} anchorDate={anchorDate} />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={`${basePath}?tab=absences&view=day`} className={mode === "day" ? "font-medium" : "text-muted-foreground transition-colors hover:text-foreground"}>
          Day
        </Link>
        <span className="text-muted-foreground">/</span>
        <Link href={`${basePath}?tab=absences&view=week`} className={mode === "week" ? "font-medium" : "text-muted-foreground transition-colors hover:text-foreground"}>
          Week
        </Link>
        <span className="text-muted-foreground">/</span>
        <Link href={`${basePath}?tab=absences&view=month`} className={mode === "month" ? "font-medium" : "text-muted-foreground transition-colors hover:text-foreground"}>
          Month
        </Link>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <Link href={`${basePath}?tab=absences&view=${mode}&date=${prevDate}`} className="text-muted-foreground transition-colors hover:text-foreground">
          ← Previous
        </Link>
        <Link href={`${basePath}?tab=absences`} className="text-muted-foreground transition-colors hover:text-foreground">
          Today
        </Link>
        <Link href={`${basePath}?tab=absences&view=${mode}&date=${nextDate}`} className="text-muted-foreground transition-colors hover:text-foreground">
          Next →
        </Link>
      </div>

      {genuineAbsences.length === 0 ? (
        <EmptyState icon={UserX} title="No absences recorded" description="Nothing has been recorded for this period." className="flex-1" />
      ) : (
        <div className="flex flex-col gap-2">
          {genuineAbsences.map((row) => {
            const report = reportByDate.get(row.work_date);
            const isPendingReview = pendingReviewDates.has(row.work_date);
            const latestReview = latestReviewByDate.get(row.work_date);
            return (
              <Card key={row.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{formatDisplayDate(row.work_date)}</span>
                    {row.note && <span className="text-sm text-muted-foreground">{row.note}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{DAILY_ATTENDANCE_STATUS_LABELS[row.status]}</Badge>
                    {report && <Badge variant="outline">{ABSENCE_REPORT_STATUS_LABELS[report.status]}</Badge>}
                    {latestReview && <Badge variant="outline">{ATTENDANCE_REVIEW_STATUS_LABELS[latestReview.status]}</Badge>}
                    {!isPendingReview && <RequestReviewButton companyId={companyId} projectId={projectId} workDate={row.work_date} />}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatDisplayDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
