import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, History, Pencil, Wrench } from "lucide-react";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { getProject, getMyProjectAssignmentRoles, listProjectAssignments } from "@/modules/projects/queries";
import { canManageProject } from "@/modules/projects/permissions";
import { listActiveEmployeesForPicker } from "@/modules/employees/queries";
import type { EmployeeOption } from "@/modules/employees/employee-options";
import { ProjectOverviewTab } from "@/modules/projects/components/project-overview-tab";
import { ProjectAssignmentsTab } from "@/modules/projects/components/project-assignments-tab";
import { ProjectStatusBadge } from "@/modules/projects/components/project-status-badge";
import { ProjectDailyOverview } from "@/modules/projects/components/project-daily-overview";
import { listWorkforceForDate, listDailyTeamsForDate, isCallerProjectAccessible } from "@/modules/daily-workforce/queries";
import { canViewDailyWorkforceBroadly } from "@/modules/daily-workforce/permissions";
import { summarizeDailyWorkforce } from "@/modules/daily-workforce/types";
import { listWorkedHoursForDate, listOpenWorkedHoursDiscrepancies } from "@/modules/worked-hours/queries";
import { getLmraOverviewCounts } from "@/modules/lmra/queries";
import { getObservationOverviewCounts } from "@/modules/observations/queries";
import { getCorrectiveActionOverviewCounts } from "@/modules/corrective-actions/queries";
import { getScaffoldOverviewCounts } from "@/modules/scaffolds/queries";
import { SectionHeader } from "@/components/shared/section-header";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ProjectDetailPageProps = {
  params: Promise<{ projectId: string }>;
};

/**
 * Project profile page — Overview / Assignments tabs, mirroring
 * app/(app)/employees/[employeeNumber]/page.tsx's tab structure for
 * consistency. Equipment/Documents/Audit are explicit placeholders (not
 * hidden tabs), same reasoning as the employee page: the information
 * architecture is visible before every module behind it exists. Teams has
 * its own promoted, project-scoped route now
 * (/companies/[companyId]/projects/[projectId]/teams) — no Teams tab lives
 * here anymore, so the same data is never rendered by two different pages.
 *
 * Routed by the raw `id` (not a human code) — see
 * modules/projects/components/project-card.tsx's comment for why
 * `code`'s optionality rules it out as a URL key the way
 * `employee_number` works for employees.
 */
export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { projectId } = await params;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    notFound();
  }

  const project = await getProject(currentCompanyId, projectId);
  if (!project) {
    notFound();
  }

  const [roleNames, myProjectRoles, hasProjectAccess] = await Promise.all([
    getUserRoleNames(currentCompanyId),
    getMyProjectAssignmentRoles(currentCompanyId, projectId, user.id),
    isCallerProjectAccessible(projectId),
  ]);
  const canManage = canManageProject(roleNames, myProjectRoles);
  const canViewDailyOverview = canViewDailyWorkforceBroadly(roleNames, hasProjectAccess);

  const [projectAssignments, pickerEmployeeRows] = await Promise.all([
    listProjectAssignments(currentCompanyId, projectId),
    listActiveEmployeesForPicker(currentCompanyId),
  ]);

  type DailyOverviewProps = Parameters<typeof ProjectDailyOverview>[0];
  let dailyOverview: { today: DailyOverviewProps["today"]; safety: DailyOverviewProps["safety"]; actionRequired: DailyOverviewProps["actionRequired"] } | null = null;
  if (canViewDailyOverview) {
    const today = new Date().toISOString().slice(0, 10);
    const [workforce, teams, hoursRows, discrepancies, lmraCounts, observationCounts, correctiveActionCounts, scaffoldCounts] = await Promise.all([
      listWorkforceForDate(currentCompanyId, projectId, today),
      listDailyTeamsForDate(currentCompanyId, projectId, today),
      listWorkedHoursForDate(currentCompanyId, projectId, today),
      listOpenWorkedHoursDiscrepancies(currentCompanyId, projectId),
      getLmraOverviewCounts(currentCompanyId, projectId),
      getObservationOverviewCounts(currentCompanyId, projectId),
      getCorrectiveActionOverviewCounts(currentCompanyId, projectId),
      getScaffoldOverviewCounts(currentCompanyId, projectId),
    ]);

    const { incompleteAttendanceCount, ...todayWorkforceCounts } = summarizeDailyWorkforce(workforce);
    const hoursSubmittedCount = hoursRows.filter((row) => row.status === "submitted").length;
    const hoursDraftCount = hoursRows.filter((row) => row.status === "draft").length;

    dailyOverview = {
      today: {
        ...todayWorkforceCounts,
        teamCount: teams.length,
        allTeamsLocked: teams.length > 0 && teams.every((team) => team.status === "locked"),
        anyTeamsOpen: teams.some((team) => team.status === "open"),
        hoursSubmittedCount,
        hoursDraftCount,
        hoursNotRecordedCount: Math.max(0, workforce.length - hoursRows.length),
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

  const pickerEmployees: EmployeeOption[] = pickerEmployeeRows.map((employee) => ({
    value: employee.id,
    label: `${employee.first_name} ${employee.last_name}`,
    employeeNumber: null,
    roleLabel: employee.position_title,
  }));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title={project.name}
        description={project.client_name ?? undefined}
        actions={
          canManage ? (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/projects/${project.id}/edit`} />}
            >
              <Pencil />
              Edit
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <ProjectStatusBadge status={project.status} />
        {project.code ? <span className="font-mono text-sm text-muted-foreground">{project.code}</span> : null}
        {project.location ? <span className="text-sm text-muted-foreground">{project.location}</span> : null}
      </div>

      {dailyOverview && (
        <div className="flex flex-col gap-3">
          <SectionHeader title="Daily overview" />
          <ProjectDailyOverview companyId={currentCompanyId} projectId={projectId} today={dailyOverview.today} safety={dailyOverview.safety} actionRequired={dailyOverview.actionRequired} />
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <ProjectOverviewTab project={project} />
        </TabsContent>

        <TabsContent value="assignments" className="pt-4">
          <ProjectAssignmentsTab
            companyId={currentCompanyId}
            projectId={projectId}
            assignments={projectAssignments}
            pickerEmployees={pickerEmployees}
            canManage={canManage}
          />
        </TabsContent>

        <TabsContent value="equipment" className="pt-4">
          <EmptyState
            icon={Wrench}
            title="Not built yet"
            description="Equipment assigned to this project will appear here once the Equipment module ships."
          />
        </TabsContent>

        <TabsContent value="documents" className="pt-4">
          <EmptyState
            icon={FileText}
            title="Not built yet"
            description="Documents attached to this project will appear here once the Documents module ships."
          />
        </TabsContent>

        <TabsContent value="audit" className="pt-4">
          <EmptyState
            icon={History}
            title="Not built yet"
            description="A history of changes to this project will appear here once the Audit tab ships."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
