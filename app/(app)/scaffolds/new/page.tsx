import { forbidden, notFound } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { getProject } from "@/modules/projects/queries";
import { listScaffoldCreatableProjects, listEligibleScaffoldForemen, listEligibleScaffoldTeamMembers } from "@/modules/scaffolds/queries";
import { ScaffoldForm } from "@/modules/scaffolds/components/scaffold-form";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { HardHat } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

type NewScaffoldPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

/** Two-step create: pick a project, then fill in the scaffold — same shape as every other module's new page this session. */
export default async function NewScaffoldPage({ searchParams }: NewScaffoldPageProps) {
  const params = await searchParams;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    forbidden();
  }

  const roleNames = await getUserRoleNames(currentCompanyId);
  const creatableProjects = await listScaffoldCreatableProjects(currentCompanyId, user.id, roleNames);

  if (!params.projectId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="Register scaffold" description="Choose the project this scaffold is for." />
        {creatableProjects.length === 0 ? (
          <EmptyState icon={HardHat} title="You don't manage any projects" description="Only an HSE Manager, or an HSE Officer/Inspector assigned to a project, can register a scaffold there." className="flex-1" />
        ) : (
          <Card className="max-w-md">
            <CardContent className="flex flex-col gap-3 pt-4">
              {creatableProjects.map((project) => (
                <Link key={project.id} href={`/scaffolds/new?projectId=${project.id}`} className="flex items-center justify-between rounded-lg border p-3 text-sm font-medium transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring">
                  {project.name}
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const project = await getProject(currentCompanyId, params.projectId);
  if (!project) {
    notFound();
  }
  if (!creatableProjects.some((candidate) => candidate.id === project.id)) {
    forbidden();
  }

  const [foremanOptions, teamMemberOptions] = await Promise.all([
    listEligibleScaffoldForemen(currentCompanyId, project.id),
    listEligibleScaffoldTeamMembers(currentCompanyId, project.id),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Register scaffold" description={`For ${project.name}.`} />
      <div className="max-w-3xl">
        <ScaffoldForm mode="create" companyId={currentCompanyId} projectId={project.id} projectName={project.name} foremanOptions={foremanOptions} teamMemberOptions={teamMemberOptions} />
      </div>
    </div>
  );
}
