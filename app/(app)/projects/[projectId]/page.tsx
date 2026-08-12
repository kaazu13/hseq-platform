import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, History, LayoutDashboard, Pencil, Wrench } from "lucide-react";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { getProject, getMyProjectAssignmentRoles, listProjectAssignments } from "@/modules/projects/queries";
import { canManageProject } from "@/modules/projects/permissions";
import { listActiveEmployeesForPicker } from "@/modules/employees/queries";
import type { EmployeeOption } from "@/modules/employees/employee-options";
import { ProjectOverviewTab } from "@/modules/projects/components/project-overview-tab";
import { ProjectAssignmentsTab } from "@/modules/projects/components/project-assignments-tab";
import { ProjectStatusBadge } from "@/modules/projects/components/project-status-badge";
import { isCallerProjectAccessible } from "@/modules/daily-workforce/queries";
import { canViewDailyWorkforceBroadly } from "@/modules/daily-workforce/permissions";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ProjectDetailPageProps = {
  params: Promise<{ projectId: string }>;
};

/**
 * Project ADMINISTRATION page — Overview / Assignments tabs, mirroring
 * app/(app)/employees/[employeeNumber]/page.tsx's tab structure for
 * consistency. Equipment/Documents/Audit are explicit placeholders (not
 * hidden tabs), same reasoning as the employee page: the information
 * architecture is visible before every module behind it exists.
 *
 * Item 8: this page is administration ONLY (edit, assignments, and the
 * placeholder tabs) — it deliberately does NOT render live daily
 * operational data (workforce/Today's Teams/hours/LMRA/scaffolds/
 * observations/corrective actions) anymore. That view now lives on the
 * canonical, company+project-scoped dashboard
 * (/companies/[companyId]/projects/[projectId], reached via the top
 * app-shell selector's "Project Dashboard" nav item — item 7) so there is
 * exactly one operational view, not two competing ones. This page links to
 * it instead of duplicating it. Teams also has its own promoted,
 * project-scoped route (.../teams) — no Teams tab lives here.
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

      {canViewDailyOverview && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <div className="flex items-center gap-3">
              <LayoutDashboard className="size-5 text-muted-foreground" aria-hidden="true" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">Live workforce, safety, and hours activity</span>
                <span className="text-xs text-muted-foreground">Today&apos;s Teams, Worked Hours, LMRA, Scaffold, and Safety activity live on the project dashboard.</span>
              </div>
            </div>
            <Button size="sm" nativeButton={false} render={<Link href={`/companies/${currentCompanyId}/projects/${projectId}`} />}>
              Open project dashboard
            </Button>
          </CardContent>
        </Card>
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
