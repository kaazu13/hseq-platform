import { notFound, forbidden } from "next/navigation";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames } from "@/lib/auth/session";
import { getProject } from "@/modules/projects/queries";
import { listScaffoldCreatableProjects, listEligibleScaffoldForemen, listEligibleScaffoldTeamMembers } from "@/modules/scaffolds/queries";
import { ScaffoldForm } from "@/modules/scaffolds/components/scaffold-form";
import { PageHeader } from "@/components/shared/page-header";

type NewScaffoldPageProps = {
  params: Promise<{ companyId: string; projectId: string }>;
};

/**
 * Register a scaffold — canonical project-scoped route. `projectId` comes
 * from the URL itself now (the caller navigated here FROM a specific
 * project), so there is no separate "choose a project" step the way the
 * old flat /scaffolds/new route needed one.
 */
export default async function NewScaffoldPage({ params }: NewScaffoldPageProps) {
  const { companyId, projectId } = await params;

  const { user } = await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const project = await getProject(companyId, projectId);
  if (!project) {
    notFound();
  }

  const roleNames = await getUserRoleNames(companyId);
  const creatableProjects = await listScaffoldCreatableProjects(companyId, user.id, roleNames);
  if (!creatableProjects.some((candidate) => candidate.id === project.id)) {
    forbidden();
  }

  const [foremanOptions, teamMemberOptions] = await Promise.all([
    listEligibleScaffoldForemen(companyId, project.id),
    listEligibleScaffoldTeamMembers(companyId, project.id),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Register scaffold" description={`For ${project.name}.`} />
      <div className="max-w-3xl">
        <ScaffoldForm mode="create" companyId={companyId} projectId={project.id} projectName={project.name} foremanOptions={foremanOptions} teamMemberOptions={teamMemberOptions} />
      </div>
    </div>
  );
}
