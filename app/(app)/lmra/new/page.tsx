import { forbidden, notFound } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentOrganization } from "@/modules/organizations/queries";
import { getProject } from "@/modules/projects/queries";
import { listLmraCreatableProjects, listLmraCandidateEmployees } from "@/modules/lmra/queries";
import { LmraAssessmentForm } from "@/modules/lmra/components/lmra-assessment-form";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

type NewLmraPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

/**
 * Two-step create: pick a project, then fill in the assessment. Project
 * isn't a field inside LmraAssessmentForm (see that component's header
 * comment — it's an immutable identity column once created), so it has to
 * be resolved here, before the form ever renders, via a plain GET-form
 * step — no client JS needed for the picker itself.
 *
 * The picker's project list (`listLmraCreatableProjects`) is already scoped
 * to what THIS caller can actually create an LMRA for (org-wide if HSE
 * Manager, otherwise only their own foreman project(s)) — same
 * project-scoped permission model as docs/ROLES_AND_PERMISSIONS.md §5,
 * mirrored in modules/lmra/permissions.ts's canManageLmra.
 */
export default async function NewLmraPage({ searchParams }: NewLmraPageProps) {
  const params = await searchParams;
  const { user } = await requireUser();
  const { currentOrganizationId } = await resolveCurrentOrganization(user.id);

  if (!currentOrganizationId) {
    forbidden();
  }

  const roleNames = await getUserRoleNames(currentOrganizationId);
  const isHseqManager = roleNames.includes("hseq_manager");
  const creatableProjects = await listLmraCreatableProjects(currentOrganizationId, user.id, isHseqManager);

  if (!params.projectId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="New LMRA" description="Choose the project this assessment is for." />
        {creatableProjects.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="You don't manage any projects"
            description="Only an HSE Manager, or a Foreman assigned to a project's team, can start an LMRA there."
            className="flex-1"
          />
        ) : (
          <Card className="max-w-md">
            <CardContent className="flex flex-col gap-3 pt-4">
              {creatableProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/lmra/new?projectId=${project.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 text-sm font-medium transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
                >
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

  const candidates = await listLmraCandidateEmployees(currentOrganizationId, project.id);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="New LMRA" description={`For ${project.name}.`} />
      <div className="max-w-3xl">
        <LmraAssessmentForm mode="create" organizationId={currentOrganizationId} projectId={project.id} projectName={project.name} candidates={candidates} />
      </div>
    </div>
  );
}
