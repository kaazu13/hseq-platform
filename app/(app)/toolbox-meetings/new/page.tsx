import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { forbidden, notFound } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentOrganization } from "@/modules/organizations/queries";
import { getProject } from "@/modules/projects/queries";
import { listToolboxMeetingCreatableProjects, listToolboxAuthorizedEmployees } from "@/modules/toolbox-meetings/queries";
import { ToolboxMeetingForm } from "@/modules/toolbox-meetings/components/toolbox-meeting-form";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";

type NewToolboxMeetingPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

/** Two-step create: pick a project, then upload the completed PDF — same shape as every other module's new page this session. */
export default async function NewToolboxMeetingPage({ searchParams }: NewToolboxMeetingPageProps) {
  const params = await searchParams;
  const { user } = await requireUser();
  const { currentOrganizationId } = await resolveCurrentOrganization(user.id);

  if (!currentOrganizationId) {
    forbidden();
  }

  const roleNames = await getUserRoleNames(currentOrganizationId);
  const creatableProjects = await listToolboxMeetingCreatableProjects(currentOrganizationId, user.id, roleNames);

  if (!params.projectId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="New toolbox meeting" description="Choose the project this meeting is for." />
        {creatableProjects.length === 0 ? (
          <EmptyState icon={MessagesSquare} title="You don't manage any projects" description="Only an HSE Manager, or an HSE Officer assigned to a project, can upload a toolbox meeting record there." className="flex-1" />
        ) : (
          <Card className="max-w-md">
            <CardContent className="flex flex-col gap-3 pt-4">
              {creatableProjects.map((project) => (
                <Link key={project.id} href={`/toolbox-meetings/new?projectId=${project.id}`} className="flex items-center justify-between rounded-lg border p-3 text-sm font-medium transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring">
                  {project.name}
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const project = await getProject(currentOrganizationId, params.projectId);
  if (!project) {
    notFound();
  }
  if (!creatableProjects.some((candidate) => candidate.id === project.id)) {
    forbidden();
  }

  const candidates = await listToolboxAuthorizedEmployees(currentOrganizationId, project.id);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="New toolbox meeting" description={`For ${project.name}.`} />
      <div className="max-w-3xl">
        <ToolboxMeetingForm organizationId={currentOrganizationId} projectId={project.id} candidates={candidates} />
      </div>
    </div>
  );
}
