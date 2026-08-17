import { forbidden, notFound } from "next/navigation";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames } from "@/lib/auth/session";
import { getProject } from "@/modules/projects/queries";
import { getScaffold, isCallerProjectAccessible, listEligibleScaffoldForemen } from "@/modules/scaffolds/queries";
import { canManageScaffold } from "@/modules/scaffolds/permissions";
import { ScaffoldForm } from "@/modules/scaffolds/components/scaffold-form";
import { getProjectLocalDate } from "@/lib/project-date";
import { PageHeader } from "@/components/shared/page-header";

type EditScaffoldPageProps = {
  params: Promise<{ companyId: string; projectId: string; scaffoldId: string }>;
};

/** Authorization hardening: same URL-vs-row project cross-check as the scaffold detail page — see that page's header comment. */
export default async function EditScaffoldPage({ params }: EditScaffoldPageProps) {
  const { companyId, projectId, scaffoldId } = await params;
  await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const project = await getProject(companyId, projectId);
  if (!project) {
    notFound();
  }

  const scaffold = await getScaffold(companyId, scaffoldId);
  if (!scaffold || scaffold.project_id !== projectId) {
    notFound();
  }

  const [roleNames, hasProjectAccess] = await Promise.all([
    getUserRoleNames(companyId),
    isCallerProjectAccessible(scaffold.project_id),
  ]);

  if (!canManageScaffold(roleNames, hasProjectAccess)) {
    forbidden();
  }

  const foremanOptions = await listEligibleScaffoldForemen(companyId, scaffold.project_id);
  const today = getProjectLocalDate(project.timezone);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Edit scaffold" description={`${project.name} · ${scaffold.tag_number}`} />
      <div className="max-w-3xl">
        <ScaffoldForm mode="edit" companyId={companyId} projectId={scaffold.project_id} projectName={project.name} foremanOptions={foremanOptions} today={today} scaffold={scaffold} />
      </div>
    </div>
  );
}
