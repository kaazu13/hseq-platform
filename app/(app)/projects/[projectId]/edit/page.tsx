import { forbidden, notFound } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { canManageProject } from "@/modules/projects/permissions";
import { getProject, getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { ProjectForm } from "@/modules/projects/components/project-form";
import { PageHeader } from "@/components/shared/page-header";

type EditProjectPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function EditProjectPage({ params }: EditProjectPageProps) {
  const { projectId } = await params;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    forbidden();
  }

  const project = await getProject(currentCompanyId, projectId);
  if (!project) {
    notFound();
  }

  const [roleNames, myProjectRoles] = await Promise.all([
    getUserRoleNames(currentCompanyId),
    getMyProjectAssignmentRoles(currentCompanyId, projectId, user.id),
  ]);
  if (!canManageProject(roleNames, myProjectRoles)) {
    forbidden();
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title={`Edit ${project.name}`} description="Update this project's details." />
      <div className="max-w-3xl">
        <ProjectForm mode="edit" companyId={currentCompanyId} project={project} />
      </div>
    </div>
  );
}
