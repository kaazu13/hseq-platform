import { forbidden, notFound } from "next/navigation";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { getProject } from "@/modules/projects/queries";
import { listObservationCreatableProjects, listObservationCandidateEmployees } from "@/modules/observations/queries";
import { listRecentDailyTeamsForProject } from "@/modules/daily-workforce/queries";
import { ObservationForm } from "@/modules/observations/components/observation-form";
import { toEmployeeOptions } from "@/modules/employees/employee-options";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Eye } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

type NewObservationPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

/**
 * Two-step create: pick a project, then fill in the observation — same
 * shape as app/(app)/lmra/new/page.tsx, for the same reason (project isn't
 * a field inside ObservationForm; it's an immutable identity column once
 * created). The picker's project list (`listObservationCreatableProjects`)
 * is broader than LMRA's — any project the caller has ANY current
 * assignment on, not just a foreman-specific one — matching this module's
 * "safety reporting should never be gated behind a manager role" grant.
 */
export default async function NewObservationPage({ searchParams }: NewObservationPageProps) {
  const params = await searchParams;
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    forbidden();
  }

  const roleNames = await getUserRoleNames(currentCompanyId);
  const creatableProjects = await listObservationCreatableProjects(currentCompanyId, user.id, roleNames);

  if (!params.projectId) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="New observation" description="Choose the project this observation is for." />
        {creatableProjects.length === 0 ? (
          <EmptyState
            icon={Eye}
            title="You're not assigned to any projects"
            description="You need an active assignment on a project before you can report an observation for it."
            className="flex-1"
          />
        ) : (
          <Card className="max-w-md">
            <CardContent className="flex flex-col gap-3 pt-4">
              {creatableProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/observations/new?projectId=${project.id}`}
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

  const project = await getProject(currentCompanyId, params.projectId);
  if (!project) {
    notFound();
  }
  if (!creatableProjects.some((candidate) => candidate.id === project.id)) {
    forbidden();
  }

  const [candidateRows, dailyTeamOptions] = await Promise.all([
    listObservationCandidateEmployees(currentCompanyId, project.id),
    listRecentDailyTeamsForProject(currentCompanyId, project.id),
  ]);
  const candidates = toEmployeeOptions(candidateRows);

  // "Create Safety Observation for team" from Today's Teams (Phase 9) —
  // only honored when it's actually one of THIS project's teams (already
  // scoped by listRecentDailyTeamsForProject above); an unrecognized/
  // cross-project id is silently ignored rather than passed through, since
  // the form's own Select only ever offers this same validated list anyway.
  const initialTargetDailyTeamId = params.dailyTeamId && dailyTeamOptions.some((option) => option.id === params.dailyTeamId) ? params.dailyTeamId : undefined;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="New observation" description={`For ${project.name}.`} />
      <div className="max-w-3xl">
        <ObservationForm
          mode="create"
          companyId={currentCompanyId}
          projectId={project.id}
          projectName={project.name}
          candidates={candidates}
          dailyTeamOptions={dailyTeamOptions}
          initialTargetDailyTeamId={initialTargetDailyTeamId}
        />
      </div>
    </div>
  );
}
