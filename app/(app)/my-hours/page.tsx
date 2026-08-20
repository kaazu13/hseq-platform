import Link from "next/link";
import { Clock, UserX } from "lucide-react";
import { getTranslations, getFormatter } from "next-intl/server";
import { requireUser } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { resolveCurrentProject } from "@/modules/projects/queries";
import { getMyEmployeeId, listMyAttendanceForPeriod } from "@/modules/daily-workforce/queries";
import { dailyAttendancePermitsWork, DAILY_ATTENDANCE_STATUS_LABELS } from "@/modules/daily-workforce/types";
import { listWorkedHoursHistoryForEmployee, listMyWorkedHoursDiscrepancies, listWorkedHoursCorrectionsByWorkedHoursIds } from "@/modules/worked-hours/queries";
import { listMyAbsenceReports } from "@/modules/absences/queries";
import { ABSENCE_REPORT_STATUS_LABELS } from "@/modules/absences/types";
import { listMyLeaveRequests } from "@/modules/leave-requests/queries";
import { listMyAttendanceReviewRequests } from "@/modules/attendance-review/queries";
import { ATTENDANCE_REVIEW_STATUS_LABELS } from "@/modules/attendance-review/types";
import { RequestReviewButton } from "@/modules/attendance-review/components/request-review-button";
import { resolveWorkedHoursPeriod, formatWorkedHoursPeriodLabel, countDaysWorked, type WorkedHoursPeriodMode } from "@/modules/worked-hours/period";
import { WORKED_HOURS_CATEGORIES, WORKED_HOURS_CATEGORY_LABELS, toWorkedHoursCategoryBreakdown, sumWorkedHoursCategoryBreakdown } from "@/modules/worked-hours/types";
import { MyHoursRow } from "@/modules/worked-hours/components/my-hours-row";
import { MyHoursMonthCalendar, type MonthDayCell } from "@/modules/worked-hours/components/my-hours-month-calendar";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
  const t = await getTranslations("MyHours");

  if (!currentCompanyId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title={t("title")} />
        <EmptyState icon={Clock} title={t("noCompanyTitle")} description={t("noCompanyDescription")} className="flex-1" />
      </div>
    );
  }

  const { currentProjectId } = await resolveCurrentProject(user.id, currentCompanyId);
  if (!currentProjectId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title={t("title")} />
        <EmptyState icon={Clock} title={t("noProjectTitle")} description={t("noProjectDescription")} className="flex-1" />
      </div>
    );
  }

  const myEmployeeId = await getMyEmployeeId(currentCompanyId, user.id);
  if (!myEmployeeId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title={t("title")} />
        <EmptyState icon={Clock} title={t("noEmployeeTitle")} description={t("noEmployeeDescription")} className="flex-1" />
      </div>
    );
  }

  const activeTab: "hours" | "absences" = params.tab === "absences" ? "absences" : "hours";
  // Part 19 — MONTH is now the default landing view (previously "day").
  const mode: WorkedHoursPeriodMode = params.view === "week" ? "week" : params.view === "day" ? "day" : "month";
  const layout: "calendar" | "list" = params.layout === "list" ? "list" : "calendar";
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

  const isCalendarView = mode === "month" && layout === "calendar";

  const [rows, discrepancies, attendanceRows, leaveRequests, absenceReports] = await Promise.all([
    listWorkedHoursHistoryForEmployee(currentCompanyId, currentProjectId, myEmployeeId, period.fromDate, period.toDate),
    listMyWorkedHoursDiscrepancies(currentCompanyId, myEmployeeId),
    isCalendarView ? listMyAttendanceForPeriod(currentCompanyId, myEmployeeId, period.fromDate, period.toDate) : Promise.resolve([]),
    isCalendarView ? listMyLeaveRequests(currentCompanyId, myEmployeeId) : Promise.resolve([]),
    isCalendarView ? listMyAbsenceReports(currentCompanyId, myEmployeeId) : Promise.resolve([]),
  ]);

  const correctionsByWorkedHoursId = await listWorkedHoursCorrectionsByWorkedHoursIds(
    currentCompanyId,
    rows.map((row) => row.id),
  );
  const discrepancyByWorkedHoursId = new Map(discrepancies.map((discrepancy) => [discrepancy.worked_hours_id, discrepancy]));

  const totalHours = rows.reduce((sum, row) => sum + Number(row.hours), 0);
  const periodCategoryTotals = toWorkedHoursCategoryBreakdown([]);
  const hoursByDate: Record<string, number> = {};
  const rowByDate = new Map(rows.map((row) => [row.work_date, row]));
  for (const row of rows) {
    for (const category of WORKED_HOURS_CATEGORIES) periodCategoryTotals[category] += row.breakdown[category];
    hoursByDate[row.work_date] = (hoursByDate[row.work_date] ?? 0) + Number(row.hours);
  }
  const daysWorked = countDaysWorked(hoursByDate);
  const basePath = "/my-hours";
  const prevDate = shiftDate(anchorDate, mode, -1);
  const nextDate = shiftDate(anchorDate, mode, 1);
  const viewSuffix = layout === "list" ? "&layout=list" : "";

  const calendarCells: MonthDayCell[] = [];
  if (isCalendarView) {
    const attendanceByDate = new Map(attendanceRows.map((row) => [row.work_date, row.status]));
    const approvedLeaveDates = new Set<string>();
    const pendingDates = new Set<string>();
    for (const request of leaveRequests) {
      const from = request.start_date < period.fromDate ? period.fromDate : request.start_date;
      const to = request.end_date > period.toDate ? period.toDate : request.end_date;
      for (let d = from; d <= to; d = addDays(d, 1)) {
        if (request.status === "approved") approvedLeaveDates.add(d);
        if (request.status === "pending") pendingDates.add(d);
      }
    }
    for (const report of absenceReports) {
      if (report.status === "pending") pendingDates.add(report.work_date);
    }

    const firstOfMonth = new Date(`${period.fromDate}T00:00:00Z`);
    // Monday-first grid: ISO day 1=Mon..7=Sun -> padding count before the 1st.
    const isoWeekday = firstOfMonth.getUTCDay() === 0 ? 7 : firstOfMonth.getUTCDay();
    const gridStart = addDays(period.fromDate, -(isoWeekday - 1));
    const totalCells = 42; // 6 full weeks — always enough for any month's Monday-first grid
    for (let i = 0; i < totalCells; i++) {
      const date = addDays(gridStart, i);
      const row = rowByDate.get(date);
      const isSunday = new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
      const attendanceStatus = attendanceByDate.get(date) ?? "not_set";
      calendarCells.push({
        date,
        isCurrentMonth: date >= period.fromDate && date <= period.toDate,
        isSunday,
        hoursTotal: hoursByDate[date] ?? 0,
        breakdown: row?.breakdown ?? null,
        attendanceStatus,
        hasPendingRequest: pendingDates.has(date),
        hasApprovedLeave: approvedLeaveDates.has(date) || attendanceStatus === "leave",
        hasConfirmedAbsence: attendanceStatus === "absent" || attendanceStatus === "sick",
        discrepancyStatus: row ? (discrepancyByWorkedHoursId.get(row.id)?.status ?? null) : null,
        correctionCount: row ? (correctionsByWorkedHoursId.get(row.id)?.length ?? 0) : 0,
      });
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title={t("title")} description={t("periodTotal", { period: formatWorkedHoursPeriodLabel(period), hours: totalHours.toFixed(1) })} />

      <MyHoursTabSwitcher active="hours" mode={mode} anchorDate={anchorDate} t={t} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={`${basePath}?view=day${viewSuffix}`} className={mode === "day" ? "font-medium" : "text-muted-foreground transition-colors hover:text-foreground"}>
            {t("day")}
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link href={`${basePath}?view=week${viewSuffix}`} className={mode === "week" ? "font-medium" : "text-muted-foreground transition-colors hover:text-foreground"}>
            {t("week")}
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link href={`${basePath}?view=month${viewSuffix}`} className={mode === "month" ? "font-medium" : "text-muted-foreground transition-colors hover:text-foreground"}>
            {t("month")}
          </Link>
        </div>
        {mode === "month" && (
          <div className="flex items-center gap-1 rounded-md border p-0.5 text-xs">
            <Link href={`${basePath}?view=month`} className={cn("rounded px-2 py-1 font-medium", layout === "calendar" ? "bg-muted" : "text-muted-foreground")}>
              {t("calendarView")}
            </Link>
            <Link href={`${basePath}?view=month&layout=list`} className={cn("rounded px-2 py-1 font-medium", layout === "list" ? "bg-muted" : "text-muted-foreground")}>
              {t("listView")}
            </Link>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 text-sm">
        <Link href={`${basePath}?view=${mode}&date=${prevDate}${viewSuffix}`} className="text-muted-foreground transition-colors hover:text-foreground">
          ← {t("previous")}
        </Link>
        <Link href={`${basePath}${mode === "month" ? "" : `?view=${mode}`}${viewSuffix}`} className="text-muted-foreground transition-colors hover:text-foreground">
          {t("today")}
        </Link>
        <Link href={`${basePath}?view=${mode}&date=${nextDate}${viewSuffix}`} className="text-muted-foreground transition-colors hover:text-foreground">
          {t("next")} →
        </Link>
      </div>

      {isCalendarView ? (
        <MyHoursMonthCalendar cells={calendarCells} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Clock} title={t("noHoursTitle")} description={t("noHoursDescription")} className="flex-1" />
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
                  {t("daysWorked")} <span className="font-medium text-foreground tabular-nums">{daysWorked}</span>
                </span>
                <span className="ml-auto font-semibold">
                  {t("grandTotal")} <span className="text-lg tabular-nums">{sumWorkedHoursCategoryBreakdown(periodCategoryTotals).toFixed(1)}h</span>
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
function MyHoursTabSwitcher({
  active,
  mode,
  anchorDate,
  t,
}: {
  active: "hours" | "absences";
  mode: WorkedHoursPeriodMode;
  anchorDate: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const suffix = `view=${mode}&date=${anchorDate}`;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
      <Link href={`/my-hours?${suffix}`} className={active === "hours" ? "text-foreground" : "text-muted-foreground transition-colors hover:text-foreground"}>
        {t("hoursTab")}
      </Link>
      <span className="text-muted-foreground">/</span>
      <Link href={`/my-hours?tab=absences&${suffix}`} className={active === "absences" ? "text-foreground" : "text-muted-foreground transition-colors hover:text-foreground"}>
        {t("absencesTab")}
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
  const [t, format] = await Promise.all([getTranslations("MyHours"), getFormatter()]);

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
  const periodLabel = mode === "week" ? `${formatDisplayDate(period.fromDate, format)} – ${formatDisplayDate(absenceToDate, format)}` : formatWorkedHoursPeriodLabel(period);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title={t("title")} description={`${periodLabel} · ${t("daysRecorded", { count: genuineAbsences.length })}`} />

      <MyHoursTabSwitcher active="absences" mode={mode} anchorDate={anchorDate} t={t} />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={`${basePath}?tab=absences&view=day`} className={mode === "day" ? "font-medium" : "text-muted-foreground transition-colors hover:text-foreground"}>
          {t("day")}
        </Link>
        <span className="text-muted-foreground">/</span>
        <Link href={`${basePath}?tab=absences&view=week`} className={mode === "week" ? "font-medium" : "text-muted-foreground transition-colors hover:text-foreground"}>
          {t("week")}
        </Link>
        <span className="text-muted-foreground">/</span>
        <Link href={`${basePath}?tab=absences&view=month`} className={mode === "month" ? "font-medium" : "text-muted-foreground transition-colors hover:text-foreground"}>
          {t("month")}
        </Link>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <Link href={`${basePath}?tab=absences&view=${mode}&date=${prevDate}`} className="text-muted-foreground transition-colors hover:text-foreground">
          ← {t("previous")}
        </Link>
        <Link href={`${basePath}?tab=absences`} className="text-muted-foreground transition-colors hover:text-foreground">
          {t("today")}
        </Link>
        <Link href={`${basePath}?tab=absences&view=${mode}&date=${nextDate}`} className="text-muted-foreground transition-colors hover:text-foreground">
          {t("next")} →
        </Link>
      </div>

      {genuineAbsences.length === 0 ? (
        <EmptyState icon={UserX} title={t("noAbsencesTitle")} description={t("noAbsencesDescription")} className="flex-1" />
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
                    <span className="text-sm font-medium">{formatDisplayDate(row.work_date, format)}</span>
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

function formatDisplayDate(value: string, format: Awaited<ReturnType<typeof getFormatter>>): string {
  return format.dateTime(new Date(`${value}T00:00:00Z`), { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
