import { forbidden, notFound } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentOrganization } from "@/modules/organizations/queries";
import { getProject } from "@/modules/projects/queries";
import { getScaffold, isCallerProjectAccessible, listScaffoldCandidateEmployees } from "@/modules/scaffolds/queries";
import { canManageScaffold } from "@/modules/scaffolds/permissions";
import { ScaffoldForm } from "@/modules/scaffolds/components/scaffold-form";
import { PageHeader } from "@/components/shared/page-header";

type EditScaffoldPageProps = {
  params: Promise<{ scaffoldId: string }>;
};

export default async function EditScaffoldPage({ params }: EditScaffoldPageProps) {
  const { scaffoldId } = await params;
  const { user } = await requireUser();
  const { currentOrganizationId } = await resolveCurrentOrganization(user.id);

  if (!currentOrganizationId) {
    forbidden();
  }

  const scaffold = await getScaffold(currentOrganizationId, scaffoldId);
  if (!scaffold) {
    notFound();
  }

  const [roleNames, hasProjectAccess, project] = await Promise.all([
    getUserRoleNames(currentOrganizationId),
    isCallerProjectAccessible(scaffold.project_id),
    getProject(currentOrganizationId, scaffold.project_id),
  ]);

  if (!canManageScaffold(roleNames, hasProjectAccess)) {
    forbidden();
  }

  const projectName = project?.name ?? "Project unavailable";
  const candidates = await listScaffoldCandidateEmployees(currentOrganizationId, scaffold.project_id);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Edit scaffold" description={`${projectName} · ${scaffold.tag_number}`} />
      <div className="max-w-3xl">
        <ScaffoldForm mode="edit" organizationId={currentOrganizationId} projectId={scaffold.project_id} projectName={projectName} candidates={candidates} scaffold={scaffold} />
      </div>
    </div>
  );
}
