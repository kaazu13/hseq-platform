import Link from "next/link";
import { notFound } from "next/navigation";
import { LayoutDashboard, Settings2 } from "lucide-react";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames } from "@/lib/auth/session";
import { getProject, getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { listWorkforceForDate, listDailyTeamsForDate, isCallerProjectAccessible } from "@/modules/daily-workforce/queries";
import { canViewDailyWorkforceBroadly } from "@/modules/daily-workforce/permissions";
import { summarizeDailyWorkforce, dailyAttendancePermitsWork } from "@/modules/daily-workforce/types";
import { listWorkedHoursForDate, listOpenWorkedHoursDiscrepancies } from "@/modules/worked-hours/queries";
import { getLmraOverviewCounts } from "@/modules/lmra/queries";
import { getObservationOverviewCounts } from "@/modules/observations/queries";
import { getCorrectiveActionOverviewCounts } from "@/modules/corrective-actions/queries";
import { getScaffoldOverviewCounts } from "@/modules/scaffolds/queries";
import { canManageProject } from "@/modules/projects/permissions";
import { ProjectDailyOverview } from "@/modules/projects/components/project-daily-overview";
import { ProjectStatusBadge } from "@/modules/projects/components/project-status-badge";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

type ProjectDashboardPageProps = {
  params: Promise<{ companyId: string; projectId: string }>;
};

/**
 * Item 7: the real project-management dashboard — reached via the top
 * app-shell company/project selector (nav-config.ts's buildHref), scoped
 * strictly to the URL's own company+project (same
 * requireCompanyMembership -> requireProjectAccess -> getProject
 * ownership chain every other canonical route in this tree uses — never
 * trusting the URL alone). Workforce/Today's Teams/Worked Hours/LMRA/
 * Scaffold/Safety Observation/Corrective Action overview data lives here,
 * not on Your Dashboard (app/(app)/dashboard/page.tsx), which stays
 * personal-only (item 6). Project ADMINISTRATION (edit, assignments,
 * equipment/documents/audit placeholders) stays on the separate
 * /projects/[projectId] detail page reached from the "Projects" sidebar
 * section (item 8) — that page links here for a project's live operational
 * view instead of duplicating it.
 */
export default async function ProjectDashboardPage({ params }: ProjectDashboardPageProps) {
  const { companyId, projectId } = await params;
  const { user } = await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const project = await getProject(companyId, projectId);
  if (!project) {
    notFound();
  }

  const [roleNames, myProjectRoles, hasProjectAccess] = await Promise.all([
    getUserRoleNames(companyId),
    getMyProjectAssignmentRoles(companyId, projectId, user.id),
    isCallerProjectAccessible(projectId),
  ]);
  const canManage = canManageProject(roleNames, myProjectRoles);
  const canViewDailyOverview = canViewDailyWorkforceBroadly(roleNames, hasProjectAccess);

  type DailyOverviewProps = Parameters<typeof ProjectDailyOverview>[0];
  let dailyOverview: { today: DailyOverviewProps["today"]; safety: DailyOverviewProps["safety"]; actionRequired: DailyOverviewProps["actionRequired"] } | null = null;
  if (canViewDailyOverview) {
    const today = new Date().toISOString().slice(0, 10);
    const [workforce, teams, hoursRows, discrepancies, lmraCounts, observationCounts, correctiveActionCounts, scaffoldCounts] = await Promise.all([
      listWorkforceForDate(companyId, projectId, today),
      listDailyTeamsForDate(companyId, projectId, today),
      listWorkedHoursForDate(companyId, projectId, today),
      listOpenWorkedHoursDiscrepancies(companyId, projectId),
      getLmraOverviewCounts(companyId, projectId),
      getObservationOverviewCounts(companyId, projectId),
      getCorrectiveActionOverviewCounts(companyId, projectId),
      getScaffoldOverviewCounts(companyId, projectId),
    ]);

    const { incompleteAttendanceCount, ...todayWorkforceCounts } = summarizeDailyWorkforce(workforce);
    const hoursSubmittedCount = hoursRows.filter((row) => row.status === "submitted").length;
    const hoursDraftCount = hoursRows.filter((row) => row.status === "draft").length;

    // Audit finding (Phase 8 of the post-audit implementation package):
    // "No Hours Recorded" previously counted every project-assigned
    // employee regardless of attendance status, inflating the count for
    // anyone confirmed absent/sick/on leave/training/off-site — people who
    // correctly need no hours today, not people missing hours. Only
    // employees whose CONFIRMED daily status still permits work
    // (dailyAttendancePermitsWork — the same TS mirror of the DB's
    // daily_attendance_permits_work() every attendance/hours gate already
    // uses) and who have no worked_hours row yet are genuinely "missing."
    const employeeIdsWithHoursToday = new Set(hoursRows.map((row) => row.employee_id));
    const hoursNotRecordedCount = workforce.filter(
      (state) => dailyAttendancePermitsWork(state.attendanceStatus) && !employeeIdsWithHoursToday.has(state.employee.id),
    ).length;

    dailyOverview = {
      today: {
        ...todayWorkforceCounts,
        teamCount: teams.length,
        allTeamsLocked: teams.length > 0 && teams.every((team) => team.status === "locked"),
        anyTeamsOpen: teams.some((team) => team.status === "open"),
        hoursSubmittedCount,
        hoursDraftCount,
        hoursNotRecordedCount,
      },
      safety: {
        lmraSubmittedToday: lmraCounts.submittedToday,
        lmraStopWork: lmraCounts.stopWork,
        observationsPositiveToday: observationCounts.positiveToday,
        observationsNegativeToday: observationCounts.negativeToday,
        openCorrectiveActions: correctiveActionCounts.open,
        scaffoldsExpiringSoon: scaffoldCounts.expiringSoon,
        scaffoldsExpired: scaffoldCounts.expired,
      },
      actionRequired: {
        openHourDiscrepancies: discrepancies.length,
        overdueCorrectiveActions: correctiveActionCounts.overdue,
        incompleteAttendanceCount,
      },
    };
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title={project.name}
        description={project.client_name ?? undefined}
        actions={
          canManage ? (
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/projects/${project.id}/edit`} />}>
              <Settings2 />
              Manage project
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <ProjectStatusBadge status={project.status} />
        {project.code ? <span className="font-mono text-sm text-muted-foreground">{project.code}</span> : null}
        {project.location ? <span className="text-sm text-muted-foreground">{project.location}</span> : null}
      </div>

      {dailyOverview ? (
        <div className="flex flex-col gap-3">
          <SectionHeader title="Daily overview" />
          <ProjectDailyOverview companyId={companyId} projectId={projectId} today={dailyOverview.today} safety={dailyOverview.safety} actionRequired={dailyOverview.actionRequired} />
        </div>
      ) : (
        <EmptyState icon={LayoutDashboard} title="No daily overview available" description="You don't have broad workforce visibility on this project." />
      )}
    </div>
  );
}
