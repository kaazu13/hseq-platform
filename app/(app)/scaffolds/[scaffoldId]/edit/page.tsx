import { forbidden, notFound } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { getProject } from "@/modules/projects/queries";
import { getScaffold, isCallerProjectAccessible, listEligibleScaffoldForemen, listEligibleScaffoldTeamMembers } from "@/modules/scaffolds/queries";
import { canManageScaffold } from "@/modules/scaffolds/permissions";
import { ScaffoldForm } from "@/modules/scaffolds/components/scaffold-form";
import { PageHeader } from "@/components/shared/page-header";

type EditScaffoldPageProps = {
  params: Promise<{ scaffoldId: string }>;
};

export default async function EditScaffoldPage({ params }: EditScaffoldPageProps) {
  const { scaffoldId } = await params;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    forbidden();
  }

  const scaffold = await getScaffold(currentCompanyId, scaffoldId);
  if (!scaffold) {
    notFound();
  }

  const [roleNames, hasProjectAccess, project] = await Promise.all([
    getUserRoleNames(currentCompanyId),
    isCallerProjectAccessible(scaffold.project_id),
    getProject(currentCompanyId, scaffold.project_id),
  ]);

  if (!canManageScaffold(roleNames, hasProjectAccess)) {
    forbidden();
  }

  const projectName = project?.name ?? "Project unavailable";
  const [foremanOptions, teamMemberOptions] = await Promise.all([
    listEligibleScaffoldForemen(currentCompanyId, scaffold.project_id),
    listEligibleScaffoldTeamMembers(currentCompanyId, scaffold.project_id),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Edit scaffold" description={`${projectName} · ${scaffold.tag_number}`} />
      <div className="max-w-3xl">
        <ScaffoldForm mode="edit" companyId={currentCompanyId} projectId={scaffold.project_id} projectName={projectName} foremanOptions={foremanOptions} teamMemberOptions={teamMemberOptions} scaffold={scaffold} />
      </div>
    </div>
  );
}
