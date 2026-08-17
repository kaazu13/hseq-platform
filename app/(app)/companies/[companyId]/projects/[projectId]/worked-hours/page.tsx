import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames } from "@/lib/auth/session";
import { getProject, getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { listWorkforceForDate } from "@/modules/daily-workforce/queries";
import { dailyAttendancePermitsWork } from "@/modules/daily-workforce/types";
import {
  listWorkedHoursForDate,
  listWorkedHoursForPeriod,
  listProjectRosterEmployees,
  listWorkedHoursArchiveDays,
  listOpenWorkedHoursDiscrepancies,
  listWorkedHoursCorrectionCountsByWorkedHoursId,
} from "@/modules/worked-hours/queries";
import { canManageWorkedHours } from "@/modules/worked-hours/permissions";
import { BulkApplyHoursBar } from "@/modules/worked-hours/components/bulk-apply-hours-bar";
import { WorkedHoursTodayView, type WorkedHoursTodayRow } from "@/modules/worked-hours/components/worked-hours-today-view";
import { SubmitWorkedHoursButton } from "@/modules/worked-hours/components/submit-worked-hours-button";
import { DiscrepancyReviewItem } from "@/modules/worked-hours/components/discrepancy-review-item";
import { WorkedHoursExportDialog } from "@/modules/worked-hours/components/worked-hours-export-dialog";
import { WorkedHoursDateNav } from "@/modules/worked-hours/components/worked-hours-date-nav";
import { toEmployeeOptions } from "@/modules/employees/employee-options";
import { getProjectLocalDate } from "@/lib/project-date";
import { PageHeader } from "@/components/shared/page-header";
import { RefreshButton } from "@/components/shared/refresh-button";
import { SectionHeader } from "@/components/shared/section-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Clock } from "lucide-react";

type WorkedHoursPageProps = {
  params: Promise<{ companyId: string; projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

function formatWorkDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Worked Hours — canonical project-scoped route (Planning & Daily nav).
 * Deliberately separate from Today's Teams' lock lifecycle (see
 * supabase/migrations/20260813090000_worked_hours.sql's header comment):
 * "where and with whom" vs. "how many hours credited" never gate each
 * other. Three views: Today (default), This Month, Archive.
 */
export default async function WorkedHoursPage({ params, searchParams }: WorkedHoursPageProps) {
  const { companyId, projectId } = await params;
  const urlParams = await searchParams;
  const { user } = await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const project = await getProject(companyId, projectId);
  if (!project) {
    notFound();
  }

  const [roleNames, myProjectRoles] = await Promise.all([getUserRoleNames(companyId), getMyProjectAssignmentRoles(companyId, projectId, user.id)]);
  const canManage = canManageWorkedHours(roleNames, myProjectRoles);
  const basePath = `/companies/${companyId}/projects/${projectId}/worked-hours`;
  const todayDate = getProjectLocalDate(project.timezone);

  if (!canManage) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="Worked Hours" description={project.name} />
        <EmptyState icon={Clock} title="Not available" description="Worked Hours is managed by your project's Administrator or Project Manager." className="flex-1" />
      </div>
    );
  }

  const view = urlParams.view === "month" ? "month" : urlParams.view === "archive" ? "archive" : "today";
  const rosterCandidates = toEmployeeOptions(await listProjectRosterEmployees(companyId, projectId));

  const viewNav = (
    <div className="flex items-center gap-2 text-sm">
      <Link href={basePath} className={view === "today" ? "font-medium" : "text-muted-foreground transition-colors hover:text-foreground"}>
        Today
      </Link>
      <span className="text-muted-foreground">/</span>
      <Link href={`${basePath}?view=month`} className={view === "month" ? "font-medium" : "text-muted-foreground transition-colors hover:text-foreground"}>
        This Month
      </Link>
      <span className="text-muted-foreground">/</span>
      <Link href={`${basePath}?view=archive`} className={view === "archive" ? "font-medium" : "text-muted-foreground transition-colors hover:text-foreground"}>
        Archive
      </Link>
    </div>
  );

  if (view === "month") {
    const monthParam = urlParams.month && /^\d{4}-\d{2}$/.test(urlParams.month) ? urlParams.month : todayDate.slice(0, 7);
    const fromDate = `${monthParam}-01`;
    const lastDay = new Date(Number(monthParam.slice(0, 4)), Number(monthParam.slice(5, 7)), 0).getDate();
    const toDate = `${monthParam}-${String(lastDay).padStart(2, "0")}`;
    const rows = await listWorkedHoursForPeriod(companyId, projectId, fromDate, toDate);

    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader
          title="Worked Hours"
          description={`${project.name} — ${monthParam}`}
          actions={<WorkedHoursExportDialog companyId={companyId} projectId={projectId} defaultMode="month" defaultDate={fromDate} rosterCandidates={rosterCandidates} />}
        />
        {viewNav}
        {rows.length === 0 ? (
          <EmptyState icon={Clock} title="No hours recorded this month" className="flex-1" />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-max text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-left font-medium">Employee</th>
                  <th className="p-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.employee.id} className="border-t">
                    <td className="p-2">
                      {row.employee.first_name} {row.employee.last_name}
                    </td>
                    <td className="p-2 text-right font-medium">{row.totalHours.toFixed(1)}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  if (view === "archive") {
    const archiveDays = await listWorkedHoursArchiveDays(companyId, projectId);
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="Worked Hours" description={`${project.name} — archive`} />
        {viewNav}
        {archiveDays.length === 0 ? (
          <EmptyState icon={Clock} title="No archived days yet" className="flex-1" />
        ) : (
          <div className="flex flex-col gap-2">
            {archiveDays.map((day) => (
              <Card key={day.workDate}>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-4">
                  <Link href={`${basePath}?date=${day.workDate}`} className="text-sm font-medium hover:underline">
                    {formatWorkDate(day.workDate)}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {day.employeeCount} {day.employeeCount === 1 ? "employee" : "employees"} · {day.totalHours.toFixed(1)}h total · {day.submittedCount} submitted
                    {day.draftCount > 0 ? `, ${day.draftCount} draft` : ""}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  const workDate = urlParams.date && /^\d{4}-\d{2}-\d{2}$/.test(urlParams.date) ? urlParams.date : todayDate;
  const [workforce, existingHours, discrepancies] = await Promise.all([
    listWorkforceForDate(companyId, projectId, workDate),
    listWorkedHoursForDate(companyId, projectId, workDate),
    listOpenWorkedHoursDiscrepancies(companyId, projectId),
  ]);

  const correctionCountsById = await listWorkedHoursCorrectionCountsByWorkedHoursId(companyId, existingHours.map((row) => row.id));
  const hoursByEmployeeId = new Map(existingHours.map((row) => [row.employee_id, row]));
  // Pre-populate from that day's Today's Teams roster (this milestone's
  // explicit "so the PM does not need to search the entire project"
  // requirement) — union with anyone who already has an hours row for
  // this date even if their team assignment has since changed.
  const assignedEmployeeIds = new Set(workforce.filter((state) => state.assignedTeam).map((state) => state.employee.id));
  const relevantEmployees = workforce.filter((state) => assignedEmployeeIds.has(state.employee.id) || hoursByEmployeeId.has(state.employee.id));
  // Item 1: never apply bulk hours to someone marked unavailable —
  // set_daily_attendance_status()/bulk_apply_worked_hours() already
  // enforce this server-side; excluding them here too means the bar's own
  // "Apply to N employees" count is honest about who will actually
  // receive it.
  const eligibleForBulkApply = relevantEmployees.filter((state) => dailyAttendancePermitsWork(state.attendanceStatus));

  const draftCount = existingHours.filter((row) => row.status === "draft").length;

  const tableRows: WorkedHoursTodayRow[] = relevantEmployees.map((state) => {
    const workedHours = hoursByEmployeeId.get(state.employee.id) ?? null;
    return {
      employee: state.employee,
      workedHours,
      attendanceStatus: state.attendanceStatus,
      correctionCount: workedHours ? correctionCountsById.get(workedHours.id) : undefined,
    };
  });

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Worked Hours"
        description={`${formatWorkDate(workDate)} · ${project.name}`}
        actions={
          <div className="flex items-center gap-2">
            <RefreshButton />
            <WorkedHoursExportDialog companyId={companyId} projectId={projectId} defaultMode="day" defaultDate={workDate} rosterCandidates={rosterCandidates} />
            <SubmitWorkedHoursButton companyId={companyId} projectId={projectId} workDate={workDate} draftCount={draftCount} />
          </div>
        }
      />
      {viewNav}
      <WorkedHoursDateNav basePath={basePath} workDate={workDate} todayDate={todayDate} />

      {discrepancies.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionHeader title="Open discrepancy reports" />
          <div className="flex flex-col gap-3">
            {discrepancies.map((d) => (
              <DiscrepancyReviewItem key={d.id} companyId={companyId} projectId={projectId} discrepancy={d} employee={d.employee} workedHours={d.workedHours} />
            ))}
          </div>
        </div>
      )}

      <BulkApplyHoursBar companyId={companyId} projectId={projectId} workDate={workDate} employeeIds={eligibleForBulkApply.map((state) => state.employee.id)} />

      {relevantEmployees.length === 0 ? (
        <EmptyState icon={Clock} title="No workforce recorded for this day" description="Assign workers to Today's Teams, or add hours directly once someone has been recorded for this date." className="flex-1" />
      ) : (
        <WorkedHoursTodayView companyId={companyId} projectId={projectId} workDate={workDate} rows={tableRows} canManage={canManage} />
      )}
    </div>
  );
}
