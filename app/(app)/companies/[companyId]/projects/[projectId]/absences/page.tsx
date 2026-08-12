import { notFound } from "next/navigation";
import { UserX } from "lucide-react";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames } from "@/lib/auth/session";
import { getProject, getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { listWorkforceForDate } from "@/modules/daily-workforce/queries";
import { canManageDailyWorkforce } from "@/modules/daily-workforce/permissions";
import { DailyWorkforceSubnav } from "@/modules/daily-workforce/components/daily-workforce-subnav";
import { listAbsentToday, getAbsenceDayLock, listAbsenceReportsForDate } from "@/modules/absences/queries";
import { AbsentTodayList } from "@/modules/absences/components/absent-today-list";
import { MarkAbsentDialog } from "@/modules/absences/components/mark-absent-dialog";
import { AbsenceDayLockControl } from "@/modules/absences/components/absence-day-lock-control";
import { AbsenceReportsReview } from "@/modules/absences/components/absence-reports-review";
import { AbsenceExportDialog } from "@/modules/absences/components/absence-export-dialog";
import { toEmployeeOptions } from "@/modules/employees/employee-options";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { EmptyState } from "@/components/shared/empty-state";

type AbsencesPageProps = {
  params: Promise<{ companyId: string; projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatWorkDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * "Absent Today" (Phase 4-7) — a filtered view over the SAME daily_attendance
 * source of truth Today's Teams already uses (listWorkforceForDate), never a
 * second attendance system. Defaults to today's project-local date.
 */
export default async function AbsencesPage({ params, searchParams }: AbsencesPageProps) {
  const { companyId, projectId } = await params;
  const urlParams = await searchParams;
  const { user } = await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const project = await getProject(companyId, projectId);
  if (!project) {
    notFound();
  }

  const [roleNames, myProjectRoles] = await Promise.all([getUserRoleNames(companyId), getMyProjectAssignmentRoles(companyId, projectId, user.id)]);
  const canManage = canManageDailyWorkforce(roleNames, myProjectRoles);

  const workDate = urlParams.date && /^\d{4}-\d{2}-\d{2}$/.test(urlParams.date) ? urlParams.date : todayIsoDate();

  const [absentToday, dayLock, reports, roster] = await Promise.all([
    listAbsentToday(companyId, projectId, workDate),
    getAbsenceDayLock(companyId, projectId, workDate),
    listAbsenceReportsForDate(companyId, projectId, workDate),
    canManage ? listWorkforceForDate(companyId, projectId, workDate) : Promise.resolve([]),
  ]);

  const isClosed = dayLock !== null && dayLock.unlocked_at === null;
  const rosterOptions = toEmployeeOptions(roster.map((state) => state.employee));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Absent Today"
        description={`${formatWorkDate(workDate)} · ${project.name}`}
        actions={<AbsenceExportDialog companyId={companyId} projectId={projectId} defaultDate={workDate} />}
      />

      <DailyWorkforceSubnav companyId={companyId} projectId={projectId} active="absences" />

      {canManage && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <AbsenceDayLockControl companyId={companyId} projectId={projectId} workDate={workDate} isClosed={isClosed} />
          <MarkAbsentDialog companyId={companyId} projectId={projectId} workDate={workDate} isClosed={isClosed} rosterOptions={rosterOptions} />
        </div>
      )}

      <div className="flex flex-col gap-3">
        <SectionHeader title="Absent" description="Employees currently marked unavailable for this day. They remain active on the project but cannot be assigned to Today's Teams." />
        {absentToday.length === 0 ? <EmptyState icon={UserX} title="No one is absent today" /> : <AbsentTodayList rows={absentToday} />}
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeader title="Self-reported absences" description="Reported by employee — review and confirm or reject." />
        <AbsenceReportsReview companyId={companyId} projectId={projectId} reports={reports} canManage={canManage} />
      </div>
    </div>
  );
}
