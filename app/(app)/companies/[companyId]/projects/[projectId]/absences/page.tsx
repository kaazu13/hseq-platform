import { notFound, forbidden } from "next/navigation";
import { UserX } from "lucide-react";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames, isEmployeeOnlyAccount, isPlatformSuperAdmin } from "@/lib/auth/session";
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
import { canReviewAttendance } from "@/modules/attendance-review/permissions";
import { listPendingAttendanceReviewRequests } from "@/modules/attendance-review/queries";
import { ReviewQueue } from "@/modules/attendance-review/components/review-queue";
import { getProjectLocalDate } from "@/lib/project-date";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { EmptyState } from "@/components/shared/empty-state";

type AbsencesPageProps = {
  params: Promise<{ companyId: string; projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

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

  const [roleNames, myProjectRoles, isSuperAdmin] = await Promise.all([getUserRoleNames(companyId), getMyProjectAssignmentRoles(companyId, projectId, user.id), isPlatformSuperAdmin()]);
  // Employee-role correction pass 2: this page had no role gate at all —
  // any project member, including a plain employee, could reach it by URL
  // and see every OTHER employee's absence status, self-reported absence
  // reports, and an always-rendered Export button. Every other role's
  // behavior here is deliberately left untouched — this task is scoped to
  // Employee only.
  if (isEmployeeOnlyAccount(roleNames)) {
    forbidden();
  }
  const canManage = canManageDailyWorkforce(roleNames, myProjectRoles);
  // Task 3 Part 19 — deliberately NARROWER than canManage (hseq_manager/
  // hse_officer/foreman can manage daily workforce but are NOT attendance
  // review-request reviewers).
  const canReview = isSuperAdmin || canReviewAttendance(roleNames, myProjectRoles);

  const workDate = urlParams.date && /^\d{4}-\d{2}-\d{2}$/.test(urlParams.date) ? urlParams.date : getProjectLocalDate(project.timezone);

  const [absentToday, dayLock, reports, roster, pendingReviews] = await Promise.all([
    listAbsentToday(companyId, projectId, workDate),
    getAbsenceDayLock(companyId, projectId, workDate),
    listAbsenceReportsForDate(companyId, projectId, workDate),
    canManage ? listWorkforceForDate(companyId, projectId, workDate) : Promise.resolve([]),
    canReview ? listPendingAttendanceReviewRequests(companyId, projectId) : Promise.resolve([]),
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

      {canReview && (
        <div className="flex flex-col gap-3">
          <SectionHeader title="Attendance review requests" description="An employee believes an already-recorded attendance status is wrong — accept to correct the record, or reject with a note." />
          <ReviewQueue companyId={companyId} projectId={projectId} requests={pendingReviews} />
        </div>
      )}
    </div>
  );
}
